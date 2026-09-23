// E2E da spec 02 — check-up mensal.
// Cobre o motor de métricas contra o banco, os insights e a narrativa.

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { MonthlyReport } from "../db/schema"
import type { Insight, MonthlyReportMetrics } from "../modules/reports/types"
import {
  __setLlm,
  api,
  makeAccount,
  makeBudget,
  makeCategory,
  makeTransaction,
  makeTransactions,
  monthOffset,
  resetDatabase,
  useMockLlm,
  withAiDisabled,
} from "../test/helpers"

interface ReportBody extends Omit<MonthlyReport, "metrics" | "insights"> {
  metrics: MonthlyReportMetrics
  insights: Insight[]
  aiAvailable: boolean
}

// O relatório é sempre do mês anterior: um mês fechado, sem viés de mês parcial
const REPORT = monthOffset(1)

/** "YYYY-MM-DD" dentro de um mês deslocado. */
function dayIn(monthsBack: number, day: number): string {
  const { month, year } = monthOffset(monthsBack)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

beforeEach(resetDatabase)
afterEach(() => __setLlm(null))

async function generate(
  overrides: Partial<{ month: number; year: number; narrate: boolean }> = {}
) {
  return api.post<ReportBody>("/reports/monthly/generate", {
    month: REPORT.month,
    year: REPORT.year,
    narrate: false,
    ...overrides,
  })
}

describe("e2e POST /reports/monthly/generate — totais", () => {
  test("os totais batem exatamente com o dashboard do mesmo mês", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Alimentação")

    await makeTransactions([
      { name: "Mercado", amount: 500, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
      { name: "Padaria", amount: 120.5, date: dayIn(1, 9), categoryId: category.id, accountId: account.id },
      { name: "Salário", amount: -8000, date: dayIn(1, 1), categoryId: category.id, accountId: account.id },
    ])

    const report = await generate()
    const dashboard = await api.get<{ totalExpenses: string; transactionCount: number }>(
      `/dashboard/summary?month=${REPORT.month}&year=${REPORT.year}`
    )

    expect(report.body.metrics.totals.totalExpenses.current).toBe(620.5)
    expect(Number(dashboard.body.totalExpenses)).toBe(
      report.body.metrics.totals.totalExpenses.current
    )
    expect(dashboard.body.transactionCount).toBe(
      report.body.metrics.totals.transactionCount.current
    )
    expect(report.body.metrics.totals.totalIncome.current).toBe(8000)
    expect(report.body.metrics.totals.netResult.current).toBe(7379.5)
  })

  test("a taxa de poupança é nula quando não há receita", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Alimentação")
    await makeTransaction({
      name: "Mercado", amount: 500, date: dayIn(1, 5),
      categoryId: category.id, accountId: account.id,
    })

    const report = await generate()
    expect(report.body.metrics.totals.savingsRate.current).toBeNull()
  })

  test("a variação contra o mês anterior é calculada", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Alimentação")
    await makeTransactions([
      { name: "A", amount: 150, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
      { name: "B", amount: 100, date: dayIn(2, 5), categoryId: category.id, accountId: account.id },
    ])

    const report = await generate()
    const totals = report.body.metrics.totals.totalExpenses
    expect(totals.current).toBe(150)
    expect(totals.previous).toBe(100)
    expect(totals.deltaPct).toBe(50)
  })

  test("mês anterior zerado não vira variação infinita", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Alimentação")
    await makeTransaction({
      name: "A", amount: 150, date: dayIn(1, 5),
      categoryId: category.id, accountId: account.id,
    })

    const report = await generate()
    expect(report.body.metrics.totals.totalExpenses.deltaPct).toBeNull()
  })

  test("dias sem gasto e maior despesa isolada", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Alimentação")
    await makeTransactions([
      { name: "Pequena", amount: 50, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
      { name: "Grande", amount: 1800, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
      { name: "Média", amount: 200, date: dayIn(1, 20), categoryId: category.id, accountId: account.id },
    ])

    const report = await generate()
    const { metrics } = report.body
    const daysInMonth = new Date(Date.UTC(REPORT.year, REPORT.month, 0)).getUTCDate()

    // Gasto em 2 dias distintos
    expect(metrics.totals.noSpendDays.current).toBe(daysInMonth - 2)
    expect(metrics.biggestExpense?.name).toBe("Grande")
    expect(metrics.biggestExpense?.amountBrl).toBe(1800)
    expect(metrics.totals.avgTicket.current).toBeCloseTo(2050 / 3, 2)
  })

  test("transações de conta sandbox ficam fora do relatório e do dashboard", async () => {
    const account = await makeAccount()
    const sandbox = await makeAccount("Claude", { isSandbox: true })
    const category = await makeCategory("Alimentação")

    await makeTransactions([
      { name: "Real", amount: 100, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
      { name: "Teste", amount: 999, date: dayIn(1, 5), categoryId: category.id, accountId: sandbox.id },
    ])

    const report = await generate()
    const dashboard = await api.get<{ totalExpenses: string }>(
      `/dashboard/summary?month=${REPORT.month}&year=${REPORT.year}`
    )
    expect(report.body.metrics.totals.totalExpenses.current).toBe(100)
    expect(Number(dashboard.body.totalExpenses)).toBe(100)
  })

  test("movimentos internos (fatura, aplicação, transferência própria) não contam", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Outros")

    await makeTransactions([
      { name: "Mercado", amount: 200, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
      { name: "Salário", amount: -5000, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
      { name: "Pagamento de fatura", amount: 4000, date: dayIn(1, 6), categoryId: category.id, accountId: account.id, kind: "bill_payment" },
      { name: "Aplicação RDB", amount: 1000, date: dayIn(1, 7), categoryId: category.id, accountId: account.id, kind: "investment" },
      { name: "Resgate RDB", amount: -300, date: dayIn(1, 8), categoryId: category.id, accountId: account.id, kind: "investment" },
      { name: "Pix para mim", amount: 50, date: dayIn(1, 9), categoryId: category.id, accountId: account.id, kind: "own_transfer" },
    ])

    const report = await generate()
    const dashboard = await api.get<{ totalExpenses: string; transactionCount: number }>(
      `/dashboard/summary?month=${REPORT.month}&year=${REPORT.year}`
    )
    expect(report.body.metrics.totals.totalExpenses.current).toBe(200)
    expect(report.body.metrics.totals.totalIncome.current).toBe(5000)
    expect(Number(dashboard.body.totalExpenses)).toBe(200)
    expect(dashboard.body.transactionCount).toBe(1)
  })
})

describe("e2e — orçamentos e 50/30/20", () => {
  test("classifica over, under, on_track e missing", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Moradia")
    const estourado = await makeBudget("Estourado", { amount: 1000 })
    const noAlvo = await makeBudget("No alvo", { amount: 1000 })
    const abaixo = await makeBudget("Abaixo", { amount: 1000 })
    await makeBudget("Esquecido", { amount: 1000 })

    await makeTransactions([
      { name: "a", amount: 1200, date: dayIn(1, 5), categoryId: category.id, accountId: account.id, recurrence: "fixed", budgetId: estourado.id },
      { name: "b", amount: 1010, date: dayIn(1, 5), categoryId: category.id, accountId: account.id, recurrence: "fixed", budgetId: noAlvo.id },
      { name: "c", amount: 900, date: dayIn(1, 5), categoryId: category.id, accountId: account.id, recurrence: "fixed", budgetId: abaixo.id },
    ])

    const report = await generate()
    const byName = new Map(report.body.metrics.budgets.map((b) => [b.name, b]))

    expect(byName.get("Estourado")!.status).toBe("over")
    expect(byName.get("No alvo")!.status).toBe("on_track")
    expect(byName.get("Abaixo")!.status).toBe("under")
    expect(byName.get("Esquecido")!.status).toBe("missing")
  })

  test("orçamento de faixa respeita os limites", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Alimentação")
    const faixa = await makeBudget("Faixa", { amountMin: 500, amountMax: 800 })

    await makeTransaction({
      name: "no limite", amount: 800.01, date: dayIn(1, 5),
      categoryId: category.id, accountId: account.id,
      recurrence: "fixed", budgetId: faixa.id,
    })

    const report = await generate()
    expect(report.body.metrics.budgets[0].status).toBe("over")
  })

  test("a distribuição segue a regra determinística", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Diversos")
    const investimento = await makeBudget("Aportes", {
      type: "investment",
      amount: 200,
    })

    await makeTransactions([
      // fixo com orçamento de investimento → investment
      { name: "Aporte", amount: 200, date: dayIn(1, 5), categoryId: category.id, accountId: account.id, recurrence: "fixed", budgetId: investimento.id },
      // variável essencial → essential
      { name: "Mercado", amount: 500, date: dayIn(1, 6), categoryId: category.id, accountId: account.id, isEssential: true },
      // variável não essencial → desire
      { name: "Cinema", amount: 300, date: dayIn(1, 7), categoryId: category.id, accountId: account.id, isEssential: false },
    ])

    const report = await generate()
    const { distribution } = report.body.metrics

    expect(distribution.investment.amountBrl).toBe(200)
    expect(distribution.essential.amountBrl).toBe(500)
    expect(distribution.desire.amountBrl).toBe(300)
    // 500 de 1000 = 50%, exatamente na meta
    expect(distribution.essential.pct).toBe(50)
    expect(distribution.essential.deltaPp).toBe(0)
    expect(distribution.investment.deltaPp).toBe(0)
  })
})

describe("e2e — anomalias, movers e estabelecimentos novos", () => {
  /** 6 meses estáveis de histórico, mais o mês do relatório. */
  async function seedHistory(currentAmount: number) {
    const account = await makeAccount()
    const category = await makeCategory("Alimentação")
    await makeTransactions([
      ...Array.from({ length: 6 }, (_, i) => ({
        name: "Mercado",
        amount: 500,
        date: dayIn(i + 2, 10),
        categoryId: category.id,
        accountId: account.id,
      })),
      {
        name: "Mercado",
        amount: currentAmount,
        date: dayIn(1, 10),
        categoryId: category.id,
        accountId: account.id,
      },
    ])
    return { category }
  }

  test("gasto muito acima do normal vira anomalia", async () => {
    const { category } = await seedHistory(1500)

    const report = await generate()
    const [anomaly] = report.body.metrics.anomalies

    expect(anomaly.categoryId).toBe(category.id)
    expect(anomaly.currentBrl).toBe(1500)
    expect(anomaly.medianBrl).toBe(500)
    expect(["high", "medium"]).toContain(anomaly.severity)
    // Sem as 3 maiores o usuário não sabe por quê
    expect(anomaly.topTransactions.length).toBeGreaterThan(0)
    expect(anomaly.history).toHaveLength(6)
  })

  test("gasto muito abaixo do normal também é notícia", async () => {
    await seedHistory(50)
    const report = await generate()
    expect(report.body.metrics.anomalies[0].severity).toBe("saving")
  })

  test("gasto dentro do padrão não vira anomalia", async () => {
    await seedHistory(505)
    const report = await generate()
    expect(report.body.metrics.anomalies).toHaveLength(0)
  })

  test("categoria sem histórico suficiente não gera anomalia", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Nova")
    await makeTransactions([
      { name: "x", amount: 100, date: dayIn(2, 5), categoryId: category.id, accountId: account.id },
      { name: "x", amount: 5000, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
    ])

    const report = await generate()
    expect(report.body.metrics.anomalies).toHaveLength(0)
  })

  test("top movers usam valor absoluto e incluem quem sumiu", async () => {
    const account = await makeAccount()
    const subiu = await makeCategory("Subiu")
    const sumiu = await makeCategory("Sumiu")

    await makeTransactions([
      { name: "a", amount: 100, date: dayIn(2, 5), categoryId: subiu.id, accountId: account.id },
      { name: "a", amount: 900, date: dayIn(1, 5), categoryId: subiu.id, accountId: account.id },
      { name: "b", amount: 400, date: dayIn(2, 5), categoryId: sumiu.id, accountId: account.id },
    ])

    const report = await generate()
    const { up, down } = report.body.metrics.topMovers

    expect(up[0].categoryName).toBe("Subiu")
    expect(up[0].deltaBrl).toBe(800)
    expect(down[0].categoryName).toBe("Sumiu")
    expect(down[0].currentBrl).toBe(0)
    expect(down[0].deltaBrl).toBe(-400)
  })

  test("estabelecimento novo acima de R$ 50 aparece; abaixo, não", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Compras")

    await makeTransactions([
      { name: "Loja Antiga", amount: 200, date: dayIn(3, 5), categoryId: category.id, accountId: account.id },
      { name: "Loja Antiga", amount: 200, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
      { name: "Loja Nova Grande", amount: 300, date: dayIn(1, 6), categoryId: category.id, accountId: account.id },
      { name: "Loja Nova Pequena", amount: 20, date: dayIn(1, 7), categoryId: category.id, accountId: account.id },
    ])

    const report = await generate()
    const labels = report.body.metrics.newMerchants.map((m) => m.label)

    expect(labels).toContain("Loja Nova Grande")
    expect(labels).not.toContain("Loja Nova Pequena")
    expect(labels).not.toContain("Loja Antiga")
  })
})

describe("e2e — insights", () => {
  test("mês negativo é o insight mais severo", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Diversos")
    await makeTransactions([
      { name: "Gasto", amount: 5000, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
      { name: "Renda", amount: -1000, date: dayIn(1, 1), categoryId: category.id, accountId: account.id },
    ])

    const report = await generate()
    expect(report.body.insights[0].kind).toBe("negative_month")
    expect(report.body.insights[0].severity).toBe("critical")
    expect(report.body.insights[0].amountBrl).toBe(4000)
  })

  test("mês sem movimento nenhum não gera insight", async () => {
    await makeBudget("Aluguel", { amount: 1000 })
    const report = await generate()

    expect(report.status).toBe(200)
    expect(report.body.insights).toHaveLength(0)
    expect(report.body.metrics.totals.totalExpenses.current).toBe(0)
  })

  test("os insights carregam referências para a UI navegar", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Moradia")
    const budget = await makeBudget("Aluguel", { amount: 1000 })
    await makeTransaction({
      name: "Aluguel", amount: 1500, date: dayIn(1, 5),
      categoryId: category.id, accountId: account.id,
      recurrence: "fixed", budgetId: budget.id,
    })

    const report = await generate()
    const over = report.body.insights.find((i) => i.kind === "budget_over")
    expect(over?.budgetId).toBe(budget.id)
  })
})

describe("e2e — narrativa", () => {
  async function seedSimpleMonth() {
    const account = await makeAccount()
    const category = await makeCategory("Alimentação")
    await makeTransactions([
      { name: "Mercado", amount: 500, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
      { name: "Salário", amount: -3000, date: dayIn(1, 1), categoryId: category.id, accountId: account.id },
    ])
  }

  test("narrativa coerente é aceita e o status vira NARRATED", async () => {
    await seedSimpleMonth()
    useMockLlm(
      JSON.stringify({
        narrative:
          "Você gastou R$ 500,00 contra R$ 3.000,00 de receita e fechou o mês bem. Continue assim no próximo período.",
        suggestions: [
          { title: "Manter o ritmo", rationale: "O mês fechou positivo.", estimatedSavingBrl: null, insightKind: null },
        ],
      })
    )

    const report = await generate({ narrate: true })
    expect(report.body.status).toBe("NARRATED")
    expect(report.body.narrative).toContain("R$ 500,00")
    expect(report.body.suggestions).toHaveLength(1)
    expect(report.body.narrativeProvider).toBe("mock")
  })

  test("narrativa com número inventado é descartada e vira NARRATION_FAILED", async () => {
    await seedSimpleMonth()
    const invented = JSON.stringify({
      narrative:
        "Você economizou R$ 9.999,00 em assinaturas neste mês, bem acima do seu padrão habitual de gastos.",
      suggestions: [
        { title: "Revisar", rationale: "Sem base nos números.", estimatedSavingBrl: null, insightKind: null },
      ],
    })
    useMockLlm(invented, invented)

    const report = await generate({ narrate: true })
    expect(report.body.status).toBe("NARRATION_FAILED")
    expect(report.body.narrative).toBeNull()
    // Os números seguem intactos — é o ponto de descartar só o texto
    expect(report.body.metrics.totals.totalExpenses.current).toBe(500)
  })

  test("provedor lançando erro não derruba a geração", async () => {
    await seedSimpleMonth()
    useMockLlm(new Error("ollama caiu"), new Error("ollama caiu de novo"))

    const report = await generate({ narrate: true })
    expect(report.status).toBe(200)
    expect(report.body.status).toBe("NARRATION_FAILED")
    expect(report.body.metrics.totals.totalExpenses.current).toBe(500)
  })

  test("com LLM_ENABLED=false o relatório sai completo, só sem narrativa", async () => {
    await seedSimpleMonth()

    const report = await withAiDisabled(() => generate({ narrate: true }))
    expect(report.status).toBe(200)
    expect(report.body.status).toBe("GENERATED")
    expect(report.body.aiAvailable).toBe(false)
    expect(report.body.narrative).toBeNull()
    expect(report.body.metrics.totals.totalExpenses.current).toBe(500)
  })

  test("POST /:id/narrate gera o texto de um relatório existente", async () => {
    await seedSimpleMonth()
    const created = await generate({ narrate: false })
    expect(created.body.status).toBe("GENERATED")

    useMockLlm(
      JSON.stringify({
        narrative:
          "Seu mês fechou com R$ 500,00 de despesas e R$ 3.000,00 de receita, um resultado confortável.",
        suggestions: [
          { title: "Seguir assim", rationale: "Mês equilibrado.", estimatedSavingBrl: null, insightKind: null },
        ],
      })
    )

    const narrated = await api.post<ReportBody>(
      `/reports/monthly/${created.body.id}/narrate`
    )
    expect(narrated.body.status).toBe("NARRATED")
    expect(narrated.body.narrative).toContain("R$ 500,00")
  })

  test("narrate com IA fora devolve 503 e não altera o relatório", async () => {
    await seedSimpleMonth()
    const created = await generate({ narrate: false })

    const res = await withAiDisabled(() =>
      api.post<{ message: string }>(`/reports/monthly/${created.body.id}/narrate`)
    )
    expect(res.status).toBe(503)

    const unchanged = await api.get<ReportBody>(
      `/reports/monthly/${created.body.id}`
    )
    expect(unchanged.body.status).toBe("GENERATED")
  })
})

describe("e2e — ciclo de vida do relatório", () => {
  test("regerar o mesmo mês sobrescreve, não duplica", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Alimentação")
    await makeTransaction({
      name: "Mercado", amount: 500, date: dayIn(1, 5),
      categoryId: category.id, accountId: account.id,
    })

    const first = await generate()
    await makeTransaction({
      name: "Extra", amount: 100, date: dayIn(1, 6),
      categoryId: category.id, accountId: account.id,
    })
    const second = await generate()

    expect(second.body.id).toBe(first.body.id)
    expect(second.body.metrics.totals.totalExpenses.current).toBe(600)

    const list = await api.get<unknown[]>("/reports/monthly")
    expect(list.body).toHaveLength(1)
  })

  test("a lista traz o resumo extraído do jsonb", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Diversos")
    await makeTransactions([
      { name: "Gasto", amount: 5000, date: dayIn(1, 5), categoryId: category.id, accountId: account.id },
      { name: "Renda", amount: -1000, date: dayIn(1, 1), categoryId: category.id, accountId: account.id },
    ])
    await generate()

    const list = await api.get<
      { totalExpenses: number; netResult: number; criticalInsights: number }[]
    >("/reports/monthly")

    expect(list.body[0].totalExpenses).toBe(5000)
    expect(list.body[0].netResult).toBe(-4000)
    expect(list.body[0].criticalInsights).toBeGreaterThanOrEqual(1)
  })

  test("GET /current gera sob demanda quando ainda não existe", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Alimentação")
    await makeTransaction({
      name: "Mercado", amount: 500, date: dayIn(1, 5),
      categoryId: category.id, accountId: account.id,
    })

    expect((await api.get<unknown[]>("/reports/monthly")).body).toHaveLength(0)

    const current = await api.get<ReportBody>("/reports/monthly/current")
    expect(current.status).toBe(200)
    expect(current.body.month).toBe(REPORT.month)
    expect(current.body.metrics.totals.totalExpenses.current).toBe(500)

    // Passou a existir, e não duplica na segunda chamada
    await api.get("/reports/monthly/current")
    expect((await api.get<unknown[]>("/reports/monthly")).body).toHaveLength(1)
  })

  test("gerar um mês em curso marca partial", async () => {
    const now = monthOffset(0)
    const report = await generate({ month: now.month, year: now.year })
    expect(report.body.metrics.period.partial).toBe(true)
  })

  test("busca por id, exclusão e 404", async () => {
    const created = await generate()
    const found = await api.get<ReportBody>(`/reports/monthly/${created.body.id}`)
    expect(found.status).toBe(200)

    expect((await api.delete(`/reports/monthly/${created.body.id}`)).status).toBe(200)
    expect((await api.get(`/reports/monthly/${created.body.id}`)).status).toBe(404)

    const missing = "00000000-0000-0000-0000-000000000000"
    expect((await api.delete(`/reports/monthly/${missing}`)).status).toBe(404)
    expect((await api.post(`/reports/monthly/${missing}/narrate`)).status).toBe(404)
  })

  test("mês inválido é recusado pela validação", async () => {
    const res = await api.post("/reports/monthly/generate", {
      month: 13,
      year: 2026,
    })
    expect(res.status).toBe(422)
  })
})
