// E2E dos pontos onde as specs se encontram: o detector de recorrências
// disparado pelas escritas de transação (spec 01) e a seção de assinaturas do
// check-up mensal, que consome essas séries (spec 02, seção 6).

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { db } from "../db"
import { recurringSeries } from "../db/schema"
import type { MonthlyReportMetrics } from "../modules/reports/types"
import type { Insight } from "../modules/reports/types"
import {
  __setLlm,
  api,
  makeAccount,
  makeCategory,
  makeTransactions,
  makeWallet,
  monthOffset,
  resetDatabase,
} from "../test/helpers"

interface ReportBody {
  id: string
  metrics: MonthlyReportMetrics
  insights: Insight[]
}

const REPORT = monthOffset(1)

function dayIn(monthsBack: number, day: number): string {
  const { month, year } = monthOffset(monthsBack)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

beforeEach(resetDatabase)
afterEach(() => __setLlm(null))

describe("e2e — escritas de transação alimentam o detector", () => {
  test("POST /transactions/bulk dispara o recálculo das séries", async () => {
    const wallet = await makeWallet()
    const account = await makeAccount("Nubank", { balance: 10000 })
    const category = await makeCategory("Streaming")

    const bulk = Array.from({ length: 4 }, (_, i) => ({
      name: "Netflix",
      amount: 55.9,
      categoryId: category.id,
      paymentMethod: "credit_card" as const,
      accountId: account.id,
      isEssential: false,
      recurrence: "variable" as const,
      budgetId: null,
      walletId: wallet.id,
      date: dayIn(4 - i, 5),
      notes: null,
    }))

    const res = await api.post<{ created: number }>("/transactions/bulk", {
      transactions: bulk,
    })
    expect(res.body.created).toBe(4)

    // O recálculo é agendado com debounce de 5s para colapsar a rajada da
    // importação — aqui só confirmamos que o agendamento aconteceu, forçando.
    expect(await db.select().from(recurringSeries)).toHaveLength(0)

    await api.post("/recurring/recalculate", { walletId: wallet.id })
    const series = await db.select().from(recurringSeries)
    expect(series).toHaveLength(1)
    expect(series[0].merchantKey).toBe("netflix")
  })

  test("excluir uma transação derruba a série no recálculo", async () => {
    const wallet = await makeWallet()
    const account = await makeAccount("Nubank", { balance: 10000 })
    const category = await makeCategory("Streaming")

    const created = await makeTransactions(
      Array.from({ length: 3 }, (_, i) => ({
        name: "Netflix",
        amount: 55.9,
        date: dayIn(3 - i, 5),
        categoryId: category.id,
        accountId: account.id,
        walletId: wallet.id,
      }))
    )

    await api.post("/recurring/recalculate", { walletId: wallet.id })
    expect(await db.select().from(recurringSeries)).toHaveLength(1)

    // Sobram 2 ocorrências — abaixo do mínimo, a série deixa de existir
    await api.delete(`/transactions/${created[0].id}`)
    await api.post("/recurring/recalculate", { walletId: wallet.id })
    expect(await db.select().from(recurringSeries)).toHaveLength(0)
  })

  test("criar e editar transação mantêm a série coerente", async () => {
    const wallet = await makeWallet()
    const account = await makeAccount("Nubank", { balance: 10000 })
    const category = await makeCategory("Streaming")

    const body = (date: string) => ({
      name: "Netflix",
      amount: 55.9,
      categoryId: category.id,
      paymentMethod: "credit_card" as const,
      accountId: account.id,
      isEssential: false,
      recurrence: "variable" as const,
      budgetId: null,
      walletId: wallet.id,
      date,
      notes: null,
    })

    await api.post("/transactions", body(dayIn(2, 5)))
    await api.post("/transactions", body(dayIn(1, 5)))
    const third = await api.post<{ id: string }>(
      "/transactions",
      body(dayIn(0, 5))
    )

    await api.post("/recurring/recalculate", { walletId: wallet.id })
    const [serie] = await db.select().from(recurringSeries)
    expect(serie.occurrences).toBe(3)

    // Editar o nome tira a transação do grupo — a chave do estabelecimento muda
    await api.put(`/transactions/${third.body.id}`, {
      ...body(dayIn(0, 5)),
      name: "Outro Servico Totalmente Diferente",
    })
    await api.post("/recurring/recalculate", { walletId: wallet.id })
    expect(await db.select().from(recurringSeries)).toHaveLength(0)
  })

  test("o saldo da conta é ajustado pelo bulk", async () => {
    const wallet = await makeWallet()
    const account = await makeAccount("Nubank", { balance: 1000 })
    const category = await makeCategory("Diversos")

    await api.post("/transactions/bulk", {
      transactions: [
        {
          name: "Gasto", amount: 300, categoryId: category.id,
          paymentMethod: "pix", accountId: account.id, isEssential: false,
          recurrence: "variable", budgetId: null, walletId: wallet.id,
          date: dayIn(0, 1), notes: null,
        },
        {
          name: "Entrada", amount: -500, categoryId: category.id,
          paymentMethod: "transfer", accountId: account.id, isEssential: false,
          recurrence: "variable", budgetId: null, walletId: wallet.id,
          date: dayIn(0, 1), notes: null,
        },
      ],
    })

    const updated = await api.get<{ balance: string }>(
      `/accounts/${account.id}`
    )
    // 1000 - 300 + 500
    expect(Number(updated.body.balance)).toBe(1200)
  })
})

describe("e2e — assinaturas no check-up mensal", () => {
  /**
   * Duas séries: uma estável e uma que subiu de preço.
   *
   * A última cobrança cai no mês corrente de propósito — uma série cuja
   * cobrança mais recente é do mês passado já nasce `OVERDUE`, e a seção de
   * assinaturas só conta as ativas.
   */
  async function seedSubscriptions(walletId: string) {
    const account = await makeAccount("Nubank", { balance: 10000 })
    const category = await makeCategory("Streaming")

    await makeTransactions([
      ...Array.from({ length: 6 }, (_, i) => ({
        name: "Netflix",
        amount: 55.9,
        date: dayIn(5 - i, 5),
        categoryId: category.id,
        accountId: account.id,
        walletId,
      })),
      ...[21.9, 21.9, 21.9, 21.9, 29.9, 29.9].map((amount, i) => ({
        name: "Spotify",
        amount,
        date: dayIn(5 - i, 8),
        categoryId: category.id,
        accountId: account.id,
        walletId,
      })),
    ])

    await api.post("/recurring/recalculate", { walletId })
  }

  test("a seção lista o total mensal e os aumentos de preço", async () => {
    const wallet = await makeWallet()
    await seedSubscriptions(wallet.id)

    const report = await api.post<ReportBody>("/reports/monthly/generate", {
      month: REPORT.month,
      year: REPORT.year,
      walletId: wallet.id,
      narrate: false,
    })

    const subs = report.body.metrics.subscriptions
    expect(subs).not.toBeNull()
    expect(subs!.activeCount).toBeGreaterThanOrEqual(1)
    expect(subs!.totalMonthlyBrl).toBeGreaterThan(0)

    const aumentou = subs!.priceIncreases.find((s) => s.label === "Spotify")
    expect(aumentou).toBeTruthy()
    expect(aumentou!.priceChangePct).toBeCloseTo(36.5, 1)
  })

  test("o aumento de preço vira insight", async () => {
    const wallet = await makeWallet()
    await seedSubscriptions(wallet.id)

    const report = await api.post<ReportBody>("/reports/monthly/generate", {
      month: REPORT.month,
      year: REPORT.year,
      walletId: wallet.id,
      narrate: false,
    })

    const insight = report.body.insights.find(
      (i) => i.kind === "subscription_price_up"
    )
    expect(insight).toBeTruthy()
    expect(insight!.title).toContain("Spotify")
    expect(insight!.recurringSeriesId).toBeTruthy()
  })

  test("sem séries detectadas, a seção simplesmente não aparece", async () => {
    const wallet = await makeWallet()
    const account = await makeAccount()
    const category = await makeCategory("Diversos")
    await makeTransactions([
      {
        name: "Compra avulsa", amount: 100, date: dayIn(1, 5),
        categoryId: category.id, accountId: account.id, walletId: wallet.id,
      },
    ])

    const report = await api.post<ReportBody>("/reports/monthly/generate", {
      month: REPORT.month,
      year: REPORT.year,
      walletId: wallet.id,
      narrate: false,
    })

    expect(report.body.metrics.subscriptions).toBeNull()
  })

  test("série dispensada não entra no relatório", async () => {
    const wallet = await makeWallet()
    await seedSubscriptions(wallet.id)

    const list = await api.get<{ data: { id: string; label: string }[] }>(
      `/recurring?walletId=${wallet.id}`
    )
    for (const serie of list.body.data) {
      await api.patch(`/recurring/${serie.id}/dismiss`)
    }

    const report = await api.post<ReportBody>("/reports/monthly/generate", {
      month: REPORT.month,
      year: REPORT.year,
      walletId: wallet.id,
      narrate: false,
    })

    expect(report.body.metrics.subscriptions).toBeNull()
  })
})

describe("e2e — o dashboard e o relatório contam a mesma história", () => {
  test("despesas, contagem e categorias batem entre as duas telas", async () => {
    const wallet = await makeWallet()
    const account = await makeAccount()
    const alimentacao = await makeCategory("Alimentação")
    const transporte = await makeCategory("Transporte")

    await makeTransactions([
      { name: "Mercado", amount: 400, date: dayIn(1, 5), categoryId: alimentacao.id, accountId: account.id, walletId: wallet.id },
      { name: "Padaria", amount: 50, date: dayIn(1, 6), categoryId: alimentacao.id, accountId: account.id, walletId: wallet.id },
      { name: "Uber", amount: 120, date: dayIn(1, 7), categoryId: transporte.id, accountId: account.id, walletId: wallet.id },
    ])

    const report = await api.post<ReportBody>("/reports/monthly/generate", {
      month: REPORT.month, year: REPORT.year, walletId: wallet.id, narrate: false,
    })
    const dashboard = await api.get<{
      totalExpenses: string
      transactionCount: number
      expensesByCategory: { categoryName: string; amount: string }[]
    }>(
      `/dashboard/summary?month=${REPORT.month}&year=${REPORT.year}&walletId=${wallet.id}`
    )

    expect(Number(dashboard.body.totalExpenses)).toBe(
      report.body.metrics.totals.totalExpenses.current
    )
    expect(dashboard.body.transactionCount).toBe(
      report.body.metrics.totals.transactionCount.current
    )

    // A maior categoria do dashboard é a maior alta/movimento do relatório
    const topDashboard = dashboard.body.expensesByCategory[0]
    const topMover = report.body.metrics.topMovers.up[0]
    expect(topMover.categoryName).toBe(topDashboard.categoryName)
    expect(topMover.currentBrl).toBe(Number(topDashboard.amount))
  })
})
