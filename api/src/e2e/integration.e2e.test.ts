// E2E dos pontos onde as specs se encontram: o detector de recorrências
// disparado pelas escritas de transação (spec 01) e a seção de assinaturas do
// check-up mensal, que consome essas séries (spec 02, seção 6).

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { db } from "../db"
import { recurringSeries, transactions } from "../db/schema"
import type { MonthlyReportMetrics } from "../modules/reports/types"
import type { Insight } from "../modules/reports/types"
import {
  __setLlm,
  api,
  makeAccount,
  makeCategory,
  makeTransactions,
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

describe("e2e — transações vêm só do Open Finance", () => {
  test("não existe criar, importar nem excluir transação", async () => {
    const account = await makeAccount("Nubank")
    const category = await makeCategory("Diversos")
    const [tx] = await makeTransactions([
      { name: "Mercado", amount: 100, date: dayIn(0, 1), categoryId: category.id, accountId: account.id },
    ])
    const body = {
      name: "Manual", amount: 10, categoryId: category.id, paymentMethod: "pix",
      accountId: account.id, isEssential: false, recurrence: "variable", date: dayIn(0, 1),
    }

    expect((await api.post("/transactions", body)).status).toBe(404)
    expect((await api.post("/transactions/bulk", { transactions: [body] })).status).toBe(404)
    expect((await api.delete(`/transactions/${tx.id}`)).status).toBe(404)
    expect(await db.select().from(transactions)).toHaveLength(1)
  })

  test("reclassificar muda só os campos do usuário, nunca valor/data/conta", async () => {
    const account = await makeAccount("Nubank")
    const category = await makeCategory("Diversos")
    const other = await makeCategory("Mercado")
    const [tx] = await makeTransactions([
      { name: "PIX 123", amount: 250, date: dayIn(0, 3), categoryId: category.id, accountId: account.id },
    ])

    const res = await api.patch<{
      name: string; categoryId: string; amount: string; date: string; paymentMethod: string
    }>(
      `/transactions/${tx.id}`,
      {
        name: "Feira", categoryId: other.id, isEssential: true,
        recurrence: "variable", budgetId: null, notes: "sábado",
        // Campos do banco no corpo são ignorados pela validação do Elysia
        amount: 1, date: "2000-01-01", paymentMethod: "pix",
      }
    )
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: "Feira", categoryId: other.id, amount: "250.00", date: dayIn(0, 3) })
    // Forma de pagamento vem do Open Finance: o PATCH não a altera
    expect(res.body.paymentMethod).toBe("credit_card")
  })

  test("entrada reclassificada nunca vira essencial", async () => {
    const account = await makeAccount("Nubank")
    const category = await makeCategory("Salário")
    const [tx] = await makeTransactions([
      { name: "Salário", amount: -5000, date: dayIn(0, 5), categoryId: category.id, accountId: account.id },
    ])
    const res = await api.patch<{ isEssential: boolean }>(`/transactions/${tx.id}`, {
      name: "Salário", categoryId: category.id, paymentMethod: "transfer",
      isEssential: true, recurrence: "variable",
    })
    expect(res.body.isEssential).toBe(false)
  })

  test("gasto fixo exige orçamento", async () => {
    const account = await makeAccount("Nubank")
    const category = await makeCategory("Moradia")
    const [tx] = await makeTransactions([
      { name: "Aluguel", amount: 2000, date: dayIn(0, 5), categoryId: category.id, accountId: account.id },
    ])
    const res = await api.patch(`/transactions/${tx.id}`, {
      name: "Aluguel", categoryId: category.id, paymentMethod: "boleto",
      isEssential: true, recurrence: "fixed", budgetId: null,
    })
    expect(res.status).toBe(400)
  })

  test("renomear na reclassificação mantém as séries coerentes", async () => {
    const account = await makeAccount("Nubank")
    const category = await makeCategory("Streaming")
    const created = await makeTransactions(
      Array.from({ length: 3 }, (_, i) => ({
        name: "Netflix",
        amount: 55.9,
        date: dayIn(2 - i, 5),
        categoryId: category.id,
        accountId: account.id,
      }))
    )

    await api.post("/recurring/recalculate")
    const [serie] = await db.select().from(recurringSeries)
    expect(serie.occurrences).toBe(3)

    // Editar o nome tira a transação do grupo — a chave do estabelecimento muda
    await api.patch(`/transactions/${created[2].id}`, {
      name: "Outro Servico Totalmente Diferente",
      categoryId: category.id,
      isEssential: false,
      recurrence: "variable",
    })
    await api.post("/recurring/recalculate")
    expect(await db.select().from(recurringSeries)).toHaveLength(0)
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
  async function seedSubscriptions() {
    const account = await makeAccount("Nubank", { balance: 10000 })
    const category = await makeCategory("Streaming")

    await makeTransactions([
      ...Array.from({ length: 6 }, (_, i) => ({
        name: "Netflix",
        amount: 55.9,
        date: dayIn(5 - i, 5),
        categoryId: category.id,
        accountId: account.id,
      })),
      ...[21.9, 21.9, 21.9, 21.9, 29.9, 29.9].map((amount, i) => ({
        name: "Spotify",
        amount,
        date: dayIn(5 - i, 8),
        categoryId: category.id,
        accountId: account.id,
      })),
    ])

    await api.post("/recurring/recalculate")
  }

  test("a seção lista o total mensal e os aumentos de preço", async () => {
    await seedSubscriptions()

    const report = await api.post<ReportBody>("/reports/monthly/generate", {
      month: REPORT.month,
      year: REPORT.year,
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
    await seedSubscriptions()

    const report = await api.post<ReportBody>("/reports/monthly/generate", {
      month: REPORT.month,
      year: REPORT.year,
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
    const account = await makeAccount()
    const category = await makeCategory("Diversos")
    await makeTransactions([
      {
        name: "Compra avulsa", amount: 100, date: dayIn(1, 5),
        categoryId: category.id, accountId: account.id,
      },
    ])

    const report = await api.post<ReportBody>("/reports/monthly/generate", {
      month: REPORT.month,
      year: REPORT.year,
      narrate: false,
    })

    expect(report.body.metrics.subscriptions).toBeNull()
  })

  test("série dispensada não entra no relatório", async () => {
    await seedSubscriptions()

    const list = await api.get<{ data: { id: string; label: string }[] }>(
      `/recurring`
    )
    for (const serie of list.body.data) {
      await api.patch(`/recurring/${serie.id}/dismiss`)
    }

    const report = await api.post<ReportBody>("/reports/monthly/generate", {
      month: REPORT.month,
      year: REPORT.year,
      narrate: false,
    })

    expect(report.body.metrics.subscriptions).toBeNull()
  })
})

describe("e2e — o dashboard e o relatório contam a mesma história", () => {
  test("despesas, contagem e categorias batem entre as duas telas", async () => {
    const account = await makeAccount()
    const alimentacao = await makeCategory("Alimentação")
    const transporte = await makeCategory("Transporte")

    await makeTransactions([
      { name: "Mercado", amount: 400, date: dayIn(1, 5), categoryId: alimentacao.id, accountId: account.id },
      { name: "Padaria", amount: 50, date: dayIn(1, 6), categoryId: alimentacao.id, accountId: account.id },
      { name: "Uber", amount: 120, date: dayIn(1, 7), categoryId: transporte.id, accountId: account.id },
    ])

    const report = await api.post<ReportBody>("/reports/monthly/generate", {
      month: REPORT.month, year: REPORT.year, narrate: false,
    })
    const dashboard = await api.get<{
      totalExpenses: string
      transactionCount: number
      expensesByCategory: { categoryName: string; amount: string }[]
    }>(
      `/dashboard/summary?month=${REPORT.month}&year=${REPORT.year}`
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
