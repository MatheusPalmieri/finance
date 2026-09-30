import { describe, expect, test } from "bun:test"
import { buildInsights, MAX_INSIGHTS } from "./insights"
import { buildDistribution, scalar, nullableScalar } from "./metrics"
import type { BudgetLine, MonthlyReportMetrics } from "./types"

const INCOME = 8000

/** Distribuição a partir de percentuais da renda (a base do 50/30/20). */
function dist(essentialPct: number, variablePct: number, investmentPct: number) {
  const of = (pct: number) => (pct / 100) * INCOME
  return buildDistribution(
    { essential: of(essentialPct), variable: of(variablePct), investment: of(investmentPct) },
    INCOME
  )
}

function metrics(
  partial: Partial<MonthlyReportMetrics> = {}
): MonthlyReportMetrics {
  return {
    period: {
      month: 11,
      year: 2025,
      from: "2025-11-01",
      to: "2025-11-30",
      partial: false,
    },
    totals: {
      totalExpenses: scalar(5000, 5000),
      totalIncome: scalar(INCOME, INCOME),
      netResult: scalar(3000, 3000),
      savingsRate: nullableScalar(37.5, 37.5),
      transactionCount: scalar(40, 40),
      avgTicket: scalar(125, 125),
      noSpendDays: scalar(10, 10),
    },
    biggestExpense: null,
    budgets: [],
    // Exatamente na meta: nenhum insight de 50/30/20 por padrão
    distribution: dist(50, 30, 20),
    anomalies: [],
    topMovers: { up: [], down: [] },
    newMerchants: [],
    subscriptions: null,
    ...partial,
  }
}

function budget(partial: Partial<BudgetLine> = {}): BudgetLine {
  return {
    categoryId: "c1",
    name: "Moradia",
    color: "#ef4444",
    group: "essential",
    amountType: "exact",
    plannedBrl: 1000,
    plannedMinBrl: null,
    plannedMaxBrl: null,
    actualBrl: 1000,
    status: "on_track",
    transactionCount: 1,
    ...partial,
  }
}

describe("buildInsights", () => {
  test("mês equilibrado e na meta não gera insight nenhum", () => {
    expect(buildInsights(metrics())).toHaveLength(0)
  })

  test("mês sem movimento nenhum não gera insight, nem de orçamento", () => {
    const out = buildInsights(
      metrics({
        totals: {
          totalExpenses: scalar(0, 0),
          totalIncome: scalar(0, 0),
          netResult: scalar(0, 0),
          savingsRate: nullableScalar(null, null),
          transactionCount: scalar(0, 0),
          avgTicket: scalar(0, 0),
          noSpendDays: scalar(31, 31),
        },
        distribution: buildDistribution({ essential: 0, variable: 0, investment: 0 }, 0),
        budgets: [
          budget({ actualBrl: 0, status: "missing", transactionCount: 0 }),
        ],
      })
    )
    expect(out).toHaveLength(0)
  })

  test("orçamento dentro da faixa não gera insight", () => {
    const out = buildInsights(
      metrics({
        budgets: [
          budget({
            amountType: "range",
            plannedBrl: null,
            plannedMinBrl: 500,
            plannedMaxBrl: 800,
            actualBrl: 650,
            status: "on_track",
          }),
        ],
      })
    )
    expect(out).toHaveLength(0)
  })

  test("orçamento estourado gera budget_over com o excesso", () => {
    const out = buildInsights(
      metrics({
        budgets: [budget({ actualBrl: 1200, status: "over" })],
      })
    )
    expect(out[0].kind).toBe("budget_over")
    expect(out[0].amountBrl).toBe(200)
    expect(out[0].categoryId).toBe("c1")
  })

  test("orçamento sem lançamento gera budget_missing", () => {
    const out = buildInsights(
      metrics({
        budgets: [budget({ actualBrl: 0, status: "missing", transactionCount: 0 })],
      })
    )
    expect(out[0].kind).toBe("budget_missing")
  })

  test("mês negativo é crítico e vem primeiro", () => {
    const out = buildInsights(
      metrics({
        totals: {
          ...metrics().totals,
          netResult: scalar(-320, 100),
        },
        budgets: [budget({ actualBrl: 1200, status: "over" })],
      })
    )
    expect(out[0].kind).toBe("negative_month")
    expect(out[0].severity).toBe("critical")
    expect(out[0].amountBrl).toBe(320)
  })

  test("anomalia high vira category_spike crítico", () => {
    const out = buildInsights(
      metrics({
        anomalies: [
          {
            categoryId: "c1",
            categoryName: "Alimentação",
            color: "#000",
            currentBrl: 1500,
            medianBrl: 900,
            robustZ: 4,
            severity: "high",
            history: [],
            topTransactions: [],
          },
        ],
      })
    )
    expect(out[0].kind).toBe("category_spike")
    expect(out[0].severity).toBe("critical")
    expect(out[0].amountBrl).toBe(600)
  })

  test("anomalia negativa vira category_saving informativo", () => {
    const out = buildInsights(
      metrics({
        anomalies: [
          {
            categoryId: "c1",
            categoryName: "Lazer",
            color: "#000",
            currentBrl: 100,
            medianBrl: 500,
            robustZ: -3,
            severity: "saving",
            history: [],
            topTransactions: [],
          },
        ],
      })
    )
    expect(out[0].kind).toBe("category_saving")
    expect(out[0].severity).toBe("info")
  })

  test("desvio acima de 5pp na 50/30/20 gera insight", () => {
    const out = buildInsights(
      metrics({
        distribution: dist(70, 30, 0),
      })
    )
    const kinds = out.map((i) => i.kind)
    expect(kinds).toContain("rule_503020_off")
    expect(out.find((i) => i.kind === "rule_503020_off")?.title).toContain("da renda")
  })

  test("sem renda no mês, a 50/30/20 não vira insight", () => {
    const out = buildInsights(
      metrics({
        totals: { ...metrics().totals, totalIncome: scalar(0, 0) },
        distribution: buildDistribution({ essential: 900, variable: 0, investment: 0 }, 0),
      })
    )
    expect(out.filter((i) => i.kind === "rule_503020_off")).toHaveLength(0)
  })

  test("desvio de exatamente 5pp não gera insight", () => {
    const out = buildInsights(
      metrics({
        distribution: dist(55, 25, 20),
      })
    )
    expect(out.filter((i) => i.kind === "rule_503020_off")).toHaveLength(0)
  })

  test("ordena por severidade e depois por valor", () => {
    const out = buildInsights(
      metrics({
        budgets: [
          budget({ categoryId: "c1", name: "Pequeno", actualBrl: 1050, status: "over" }),
          budget({ categoryId: "c2", name: "Grande", actualBrl: 2000, status: "over" }),
        ],
      })
    )
    expect(out[0].facts.budgetName).toBe("Grande")
    expect(out[1].facts.budgetName).toBe("Pequeno")
  })

  test("guarda no máximo 12 insights", () => {
    const budgetLines = Array.from({ length: 30 }, (_, i) =>
      budget({ categoryId: `c${i}`, name: `Orç ${i}`, actualBrl: 2000, status: "over" })
    )
    expect(buildInsights(metrics({ budgets: budgetLines })).length).toBe(
      MAX_INSIGHTS
    )
  })

  test("assinatura nova e aumento de preço geram insights", () => {
    const out = buildInsights(
      metrics({
        subscriptions: {
          totalMonthlyBrl: 437.9,
          activeCount: 11,
          newThisMonth: [{ id: "s1", label: "Netflix", monthlyCostBrl: 55.9 }],
          priceIncreases: [
            {
              id: "s2",
              label: "Spotify",
              monthlyCostBrl: 21.9,
              priceChangePct: 18,
            },
          ],
          inactive: [],
        },
      })
    )
    const kinds = out.map((i) => i.kind)
    expect(kinds).toContain("subscription_new")
    expect(kinds).toContain("subscription_price_up")
  })
})
