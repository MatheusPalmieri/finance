// E2E da spec 03 — projeção de fluxo de caixa e simulador "posso comprar?".

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { AppSettings } from "../db/schema"
import type {
  AffordabilityActions,
  AffordabilityVerdict,
  CashflowProjection,
} from "../modules/forecast/types"
import {
  __setLlm,
  api,
  makeAccount,
  makeBudget,
  makeCategory,
  makeTransaction,
  makeTransactions,
  makeWallet,
  monthsAgo,
  resetDatabase,
  useMockLlm,
  withAiDisabled,
} from "../test/helpers"

interface SimulateBody {
  base: CashflowProjection
  withScenario: CashflowProjection
  verdict: AffordabilityVerdict
}
interface AffordBody extends SimulateBody {
  actions: AffordabilityActions
}

beforeEach(resetDatabase)
afterEach(() => __setLlm(null))

/** Base saudável: 6 meses de salário e um gasto variável estável. */
async function seedHealthyWallet() {
  const wallet = await makeWallet()
  const checking = await makeAccount("Nubank", {
    type: "CHECKING",
    balance: 20000,
  })
  const category = await makeCategory("Alimentação")

  await makeTransactions([
    ...Array.from({ length: 6 }, (_, i) => ({
      name: "Salário",
      amount: -8000,
      date: monthsAgo(i + 1, 5),
      categoryId: category.id,
      accountId: checking.id,
      walletId: wallet.id,
      paymentMethod: "transfer" as const,
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      name: "Mercado",
      amount: 1200,
      date: monthsAgo(i + 1, 12),
      categoryId: category.id,
      accountId: checking.id,
      walletId: wallet.id,
      isEssential: true,
    })),
  ])

  return { wallet, checking, category }
}

describe("e2e GET /forecast/cashflow", () => {
  test("o saldo inicial soma só contas que não são cartão, e lista quais", async () => {
    await makeAccount("Nubank", { type: "CHECKING", balance: 8000 })
    await makeAccount("Itaú", { type: "SAVINGS", balance: 2000.5 })
    await makeAccount("Cartão", { type: "CREDIT_CARD", balance: -5000 })

    const res = await api.get<CashflowProjection>("/forecast/cashflow")

    expect(res.status).toBe(200)
    expect(res.body.openingBalance).toBe(10000.5)
    const names = res.body.openingAccounts.map((a) => a.name)
    expect(names).toEqual(expect.arrayContaining(["Nubank", "Itaú"]))
    expect(names).not.toContain("Cartão")
  })

  test("a mesma projeção consultada duas vezes devolve números idênticos", async () => {
    const { wallet } = await seedHealthyWallet()
    const first = await api.get<CashflowProjection>(
      `/forecast/cashflow?walletId=${wallet.id}&horizonMonths=6`
    )
    const second = await api.get<CashflowProjection>(
      `/forecast/cashflow?walletId=${wallet.id}&horizonMonths=6`
    )
    expect(second.body).toEqual(first.body)
  })

  test("os percentis são monotônicos em todos os meses", async () => {
    const { wallet } = await seedHealthyWallet()
    const res = await api.get<CashflowProjection>(
      `/forecast/cashflow?walletId=${wallet.id}&horizonMonths=6`
    )

    for (const month of res.body.months) {
      const { p10, p25, p50, p75, p90 } = month.balance
      expect(p10).toBeLessThanOrEqual(p25)
      expect(p25).toBeLessThanOrEqual(p50)
      expect(p50).toBeLessThanOrEqual(p75)
      expect(p75).toBeLessThanOrEqual(p90)
      expect(month.probNegative).toBeGreaterThanOrEqual(0)
      expect(month.probNegative).toBeLessThanOrEqual(1)
    }
  })

  test("o horizonte respeita o parâmetro e o teto de 12 meses", async () => {
    await makeAccount()
    expect(
      (await api.get<CashflowProjection>("/forecast/cashflow?horizonMonths=3"))
        .body.months
    ).toHaveLength(3)
    expect(
      (await api.get<CashflowProjection>("/forecast/cashflow?horizonMonths=99"))
        .body.months
    ).toHaveLength(12)
    // Sem o parâmetro, usa o default das preferências
    expect(
      (await api.get<CashflowProjection>("/forecast/cashflow")).body.months
    ).toHaveLength(6)
  })

  test("detecta a receita recorrente e a expõe nas premissas", async () => {
    const { wallet } = await seedHealthyWallet()
    const res = await api.get<CashflowProjection>(
      `/forecast/cashflow?walletId=${wallet.id}`
    )

    const income = res.body.assumptions.recurringIncome
    expect(income.sources).toHaveLength(1)
    expect(income.sources[0].label).toBe("Salário")
    expect(income.monthlyTotal).toBe(8000)
    // Meses futuros esperam a receita cheia
    expect(res.body.months[1].expectedIncome).toBe(8000)
  })

  test("entrada esporádica não vira receita recorrente", async () => {
    const wallet = await makeWallet()
    const account = await makeAccount("Nubank", { balance: 1000 })
    const category = await makeCategory("Extra")
    // Só 3 dos últimos 6 meses — abaixo do mínimo
    await makeTransactions(
      [1, 2, 3].map((i) => ({
        name: "Freela",
        amount: -2000,
        date: monthsAgo(i, 5),
        categoryId: category.id,
        accountId: account.id,
        walletId: wallet.id,
      }))
    )

    const res = await api.get<CashflowProjection>(
      `/forecast/cashflow?walletId=${wallet.id}`
    )
    expect(res.body.assumptions.recurringIncome.sources).toHaveLength(0)
    expect(res.body.months[1].expectedIncome).toBe(0)
  })

  test("base com pouco histórico é sinalizada, não apresentada como certeza", async () => {
    const wallet = await makeWallet()
    const account = await makeAccount("Nubank", { balance: 1000 })
    const category = await makeCategory("Lazer")
    await makeTransactions([
      { name: "Cinema", amount: 50, date: monthsAgo(1, 5), categoryId: category.id, accountId: account.id, walletId: wallet.id },
      { name: "Cinema", amount: 60, date: monthsAgo(2, 5), categoryId: category.id, accountId: account.id, walletId: wallet.id },
    ])

    const res = await api.get<CashflowProjection>(
      `/forecast/cashflow?walletId=${wallet.id}`
    )
    expect(res.body.assumptions.historyMonths).toBeLessThan(3)
    expect(res.body.assumptions.lowConfidenceCategories).toContain("Lazer")
  })

  test("orçamentos fixos entram como saída determinística", async () => {
    await makeAccount("Nubank", { balance: 10000 })
    await makeBudget("Aluguel", { amount: 2000 })

    const res = await api.get<CashflowProjection>(
      "/forecast/cashflow?horizonMonths=3"
    )
    // O mês corrente entra pro-rata; os seguintes, cheios
    expect(res.body.months[1].fixedExpenses).toBe(2000)
    expect(res.body.months[2].fixedExpenses).toBe(2000)
  })

  test("transações já lançadas no futuro entram no mês certo", async () => {
    const wallet = await makeWallet()
    const account = await makeAccount("Nubank", { balance: 10000 })
    const category = await makeCategory("Impostos")
    await makeTransaction({
      name: "IPVA",
      amount: 1800,
      date: monthsAgo(-1, 10), // mês que vem
      categoryId: category.id,
      accountId: account.id,
      walletId: wallet.id,
    })

    const res = await api.get<CashflowProjection>(
      `/forecast/cashflow?walletId=${wallet.id}&horizonMonths=3`
    )
    expect(res.body.months[1].knownTransactions).toBe(1800)
    expect(res.body.months[0].knownTransactions).toBe(0)
  })

  test("as premissas expõem o modelo por inteiro", async () => {
    const { wallet } = await seedHealthyWallet()
    const res = await api.get<CashflowProjection>(
      `/forecast/cashflow?walletId=${wallet.id}`
    )
    const { assumptions } = res.body

    expect(assumptions.simulationRuns).toBe(5000)
    expect(typeof assumptions.seed).toBe("number")
    expect(assumptions.minimumReserveIsDefault).toBe(true)
    expect(assumptions.minimumReserveBrl).toBeGreaterThan(0)
    expect(Array.isArray(assumptions.categoriesWithTrend)).toBe(true)
  })
})

describe("e2e POST /forecast/simulate", () => {
  test("10x sem juros aplica exatamente total/10 em 10 meses consecutivos", async () => {
    const { wallet } = await seedHealthyWallet()

    const res = await api.post<SimulateBody>("/forecast/simulate", {
      walletId: wallet.id,
      horizonMonths: 12,
      events: [
        {
          kind: "installment_purchase",
          label: "Notebook",
          totalAmount: 4000,
          installments: 10,
        },
      ],
    })

    const impacts = res.body.withScenario.months.map((m) => m.scenarioImpact)
    // Sem startMonth, começa no próximo mês
    expect(impacts[0]).toBe(0)
    for (let i = 1; i <= 10; i++) expect(impacts[i]).toBe(400)
    expect(impacts[11]).toBe(0)
  })

  test("devolve base e cenário para a UI sobrepor as curvas", async () => {
    const { wallet } = await seedHealthyWallet()

    const res = await api.post<SimulateBody>("/forecast/simulate", {
      walletId: wallet.id,
      events: [
        { kind: "one_off", label: "Viagem", amount: 5000, month: nextMonthKey() },
      ],
    })

    expect(res.body.base.months).toHaveLength(6)
    expect(res.body.withScenario.months).toHaveLength(6)
    expect(res.body.withScenario.summary.endBalanceP50).toBeLessThan(
      res.body.base.summary.endBalanceP50
    )
    expect(res.body.base.openingBalance).toBe(
      res.body.withScenario.openingBalance
    )
  })

  test("eventos empilham: comprar e cortar ao mesmo tempo", async () => {
    const { wallet } = await seedHealthyWallet()

    const onlyBuy = await api.post<SimulateBody>("/forecast/simulate", {
      walletId: wallet.id,
      events: [
        { kind: "recurring_change", label: "Academia", monthlyAmount: 200 },
      ],
    })
    const buyAndCut = await api.post<SimulateBody>("/forecast/simulate", {
      walletId: wallet.id,
      events: [
        { kind: "recurring_change", label: "Academia", monthlyAmount: 200 },
        { kind: "recurring_change", label: "Cortar streaming", monthlyAmount: -55 },
      ],
    })

    expect(buyAndCut.body.withScenario.summary.endBalanceP50).toBeGreaterThan(
      onlyBuy.body.withScenario.summary.endBalanceP50
    )
  })

  test("aumento de renda melhora a projeção", async () => {
    const { wallet } = await seedHealthyWallet()

    const res = await api.post<SimulateBody>("/forecast/simulate", {
      walletId: wallet.id,
      events: [
        { kind: "income_change", label: "Aumento", monthlyAmount: 1000 },
      ],
    })

    expect(res.body.withScenario.summary.endBalanceP50).toBeGreaterThan(
      res.body.base.summary.endBalanceP50
    )
  })

  test("cenário vazio devolve base e cenário iguais", async () => {
    const { wallet } = await seedHealthyWallet()
    const res = await api.post<SimulateBody>("/forecast/simulate", {
      walletId: wallet.id,
      events: [],
    })
    expect(res.body.withScenario.months).toEqual(res.body.base.months)
  })
})

describe("e2e POST /forecast/afford", () => {
  test("compra pequena numa base saudável é aprovada", async () => {
    const { wallet } = await seedHealthyWallet()

    const res = await api.post<AffordBody>("/forecast/afford", {
      walletId: wallet.id,
      totalAmount: 500,
      installments: 1,
      label: "Fone",
    })

    expect(res.status).toBe(200)
    expect(["safe", "tight"]).toContain(res.body.verdict.verdict)
    expect(res.body.verdict.reason.length).toBeGreaterThan(0)
  })

  test("gasto absurdo devolve 'no' sem travar", async () => {
    const { wallet } = await seedHealthyWallet()

    const started = Date.now()
    const res = await api.post<AffordBody>("/forecast/afford", {
      walletId: wallet.id,
      totalAmount: 500000,
      installments: 1,
      label: "Absurdo",
    })

    expect(Date.now() - started).toBeLessThan(5000)
    expect(res.body.verdict.verdict).toBe("no")
    expect(res.body.actions.maxAffordableTotal!).toBeLessThan(500000)
  })

  test("os acionáveis são coerentes com o veredito", async () => {
    const { wallet } = await seedHealthyWallet()

    const res = await api.post<AffordBody>("/forecast/afford", {
      walletId: wallet.id,
      totalAmount: 30000,
      installments: 1,
      label: "Carro usado",
    })

    const { actions } = res.body
    expect(actions.bestStartMonth).toMatch(/^\d{4}-\d{2}$/)
    if (actions.saferInstallments !== null) {
      expect(actions.saferInstallments).toBeGreaterThanOrEqual(1)
    }
    if (actions.maxAffordableTotal !== null) {
      expect(actions.maxAffordableTotal).toBeGreaterThanOrEqual(0)
    }
  })

  test("parcelar alivia o impacto mensal", async () => {
    const { wallet } = await seedHealthyWallet()

    const aVista = await api.post<AffordBody>("/forecast/afford", {
      walletId: wallet.id,
      totalAmount: 12000,
      installments: 1,
    })
    const parcelado = await api.post<AffordBody>("/forecast/afford", {
      walletId: wallet.id,
      totalAmount: 12000,
      installments: 12,
    })

    expect(parcelado.body.verdict.minBalanceP10).toBeGreaterThan(
      aVista.body.verdict.minBalanceP10
    )
  })

  test("juros aumentam a parcela", async () => {
    const { wallet } = await seedHealthyWallet()

    const semJuros = await api.post<AffordBody>("/forecast/afford", {
      walletId: wallet.id, totalAmount: 6000, installments: 6,
    })
    const comJuros = await api.post<AffordBody>("/forecast/afford", {
      walletId: wallet.id, totalAmount: 6000, installments: 6,
      monthlyInterestPct: 3,
    })

    const first = (b: AffordBody) =>
      b.withScenario.months.find((m) => m.scenarioImpact > 0)!.scenarioImpact
    expect(first(comJuros.body)).toBeGreaterThan(first(semJuros.body))
  })

  test("valor zero ou negativo é recusado", async () => {
    expect(
      (await api.post("/forecast/afford", { totalAmount: 0 })).status
    ).toBe(400)
    expect(
      (await api.post("/forecast/afford", { totalAmount: -100 })).status
    ).toBe(400)
  })

  test("a reserva mínima configurada muda o veredito", async () => {
    const { wallet } = await seedHealthyWallet()

    const semReserva = await api.post<AffordBody>("/forecast/afford", {
      walletId: wallet.id, totalAmount: 15000, installments: 1,
    })

    await api.put("/settings", { minimumReserveBrl: 50000 })

    const comReserva = await api.post<AffordBody>("/forecast/afford", {
      walletId: wallet.id, totalAmount: 15000, installments: 1,
    })

    expect(comReserva.body.verdict.minimumReserveBrl).toBe(50000)
    expect(comReserva.body.verdict.verdict).not.toBe("safe")
    expect(semReserva.body.verdict.minimumReserveBrl).toBeLessThan(50000)
  })
})

describe("e2e POST /forecast/parse", () => {
  test("traduz a frase em evento e devolve a interpretação", async () => {
    const category = await makeCategory("Eletrônicos")
    useMockLlm(
      JSON.stringify({
        events: [
          {
            kind: "installment_purchase",
            label: "Notebook",
            totalAmount: 4000,
            installments: 10,
            monthlyInterestPct: 0,
            categoryId: category.id,
          },
        ],
        interpretation: "Compra de notebook de R$ 4.000 em 10x sem juros.",
      })
    )

    const res = await api.post<{
      events: { kind: string; totalAmount: number }[]
      interpretation: string
      aiAvailable: boolean
    }>("/forecast/parse", { text: "um notebook de 4 mil em 10x" })

    expect(res.body.aiAvailable).toBe(true)
    expect(res.body.events).toHaveLength(1)
    expect(res.body.events[0].totalAmount).toBe(4000)
    expect(res.body.interpretation).toContain("notebook")
  })

  test("categoria inventada é neutralizada antes de chegar ao formulário", async () => {
    await makeCategory("Eletrônicos")
    useMockLlm(
      JSON.stringify({
        events: [
          {
            kind: "installment_purchase",
            label: "Notebook",
            totalAmount: 4000,
            installments: 1,
            categoryId: "00000000-0000-0000-0000-000000000000",
          },
        ],
        interpretation: "ok",
      })
    )

    const res = await api.post<{ events: { categoryId: string | null }[] }>(
      "/forecast/parse",
      { text: "notebook" }
    )
    expect(res.body.events[0].categoryId).toBeNull()
  })

  test("provedor fora do ar devolve aiAvailable: false, nunca 500", async () => {
    useMockLlm(new Error("ollama caiu"), new Error("de novo"))

    const res = await api.post<{ events: unknown[]; aiAvailable: boolean }>(
      "/forecast/parse",
      { text: "um notebook de 4 mil" }
    )

    expect(res.status).toBe(200)
    expect(res.body.aiAvailable).toBe(false)
    expect(res.body.events).toEqual([])
  })

  test("com LLM_ENABLED=false a rota segue respondendo 200", async () => {
    const res = await withAiDisabled(() =>
      api.post<{ aiAvailable: boolean }>("/forecast/parse", { text: "notebook" })
    )
    expect(res.status).toBe(200)
    expect(res.body.aiAvailable).toBe(false)
  })

  test("texto vazio é recusado pela validação", async () => {
    expect((await api.post("/forecast/parse", { text: "" })).status).toBe(422)
  })
})

describe("e2e — a projeção não depende de IA", () => {
  test("com LLM_ENABLED=false o motor inteiro continua funcionando", async () => {
    const { wallet } = await seedHealthyWallet()

    const { cashflow, afford } = await withAiDisabled(async () => ({
      cashflow: await api.get<CashflowProjection>(
        `/forecast/cashflow?walletId=${wallet.id}`
      ),
      afford: await api.post<AffordBody>("/forecast/afford", {
        walletId: wallet.id,
        totalAmount: 1000,
        installments: 1,
      }),
    }))

    expect(cashflow.status).toBe(200)
    expect(cashflow.body.months).toHaveLength(6)
    expect(afford.status).toBe(200)
    expect(afford.body.verdict.verdict).toBeTruthy()
    expect(afford.body.actions.bestStartMonth).toBeTruthy()
  })
})

describe("e2e /settings", () => {
  test("cria a linha singleton sob demanda com os defaults", async () => {
    const res = await api.get<AppSettings>("/settings")
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(1)
    expect(res.body.minimumReserveBrl).toBeNull()
    expect(res.body.defaultHorizonMonths).toBe(6)
  })

  test("atualiza e reflete na projeção", async () => {
    await makeAccount("Nubank", { balance: 5000 })

    const updated = await api.put<AppSettings>("/settings", {
      minimumReserveBrl: 2500,
      defaultHorizonMonths: 3,
    })
    expect(updated.body.defaultHorizonMonths).toBe(3)

    const projection = await api.get<CashflowProjection>("/forecast/cashflow")
    expect(projection.body.months).toHaveLength(3)
    expect(projection.body.assumptions.minimumReserveBrl).toBe(2500)
    expect(projection.body.assumptions.minimumReserveIsDefault).toBe(false)
  })

  test("reserva nula volta a usar o default calculado", async () => {
    await api.put("/settings", { minimumReserveBrl: 2500 })
    await api.put("/settings", { minimumReserveBrl: null })

    const res = await api.get<AppSettings>("/settings")
    expect(res.body.minimumReserveBrl).toBeNull()

    await makeAccount("Nubank", { balance: 1000 })
    const projection = await api.get<CashflowProjection>("/forecast/cashflow")
    expect(projection.body.assumptions.minimumReserveIsDefault).toBe(true)
  })

  test("horizonte fora de 1–12 é recusado", async () => {
    expect(
      (await api.put("/settings", { defaultHorizonMonths: 99 })).status
    ).toBe(422)
  })
})

/** "YYYY-MM" do próximo mês. */
function nextMonthKey(): string {
  const now = new Date()
  const zeroBased = now.getFullYear() * 12 + now.getMonth() + 1
  const year = Math.floor(zeroBased / 12)
  const month = (zeroBased % 12) + 1
  return `${year}-${String(month).padStart(2, "0")}`
}
