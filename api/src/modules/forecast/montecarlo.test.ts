import { describe, expect, test } from "bun:test"
import {
  horizonMonths,
  monthKey,
  monthLabel,
  percentile,
  SIMULATION_RUNS,
  simulate,
  trendFactor,
} from "./montecarlo"
import type { CategorySeries, MonthPlan, SimulationInput } from "./types"

function plan(partial: Partial<MonthPlan> = {}): MonthPlan {
  return {
    month: 10,
    year: 2026,
    label: "out/26",
    expectedIncome: 0,
    fixedExpenses: 0,
    rangeBudgets: [],
    knownTransactions: 0,
    scenarioImpact: 0,
    remainingFraction: 1,
    ...partial,
  }
}

function category(series: number[], partial: Partial<CategorySeries> = {}): CategorySeries {
  return {
    categoryId: "c1",
    categoryName: "Alimentação",
    series,
    lowConfidence: false,
    trendMonthlyPct: null,
    ...partial,
  }
}

function input(partial: Partial<SimulationInput> = {}): SimulationInput {
  return {
    openingBalance: 10000,
    months: [plan()],
    categories: [],
    runs: 500,
    seed: 123,
    ...partial,
  }
}

describe("percentile", () => {
  test("interpola linearmente", () => {
    expect(percentile([0, 10], 0.5)).toBe(5)
  })

  test("extremos", () => {
    expect(percentile([1, 2, 3], 0)).toBe(1)
    expect(percentile([1, 2, 3], 1)).toBe(3)
  })

  test("array vazio devolve 0 em vez de lançar", () => {
    expect(percentile([], 0.5)).toBe(0)
  })
})

describe("trendFactor", () => {
  test("sem tendência é fator 1", () => {
    expect(trendFactor(null, 5)).toBe(1)
  })

  test("acumula ao longo dos meses", () => {
    expect(trendFactor(0.05, 0)).toBeCloseTo(1.05, 10)
    expect(trendFactor(0.05, 1)).toBeCloseTo(1.1, 10)
  })

  test("é limitada a +-20% no horizonte", () => {
    expect(trendFactor(0.05, 11)).toBeCloseTo(1.2, 10)
    expect(trendFactor(-0.05, 11)).toBeCloseTo(0.8, 10)
  })
})

describe("simulate", () => {
  test("série histórica constante colapsa todos os percentis", () => {
    const result = simulate(
      input({ categories: [category([200, 200, 200, 200])] })
    )
    const { balance } = result.months[0]
    expect(balance.p10).toBe(balance.p90)
    expect(balance.p50).toBe(9800) // 10000 - 200
  })

  test("com série constante, probNegative é 0 ou 1, nunca intermediário", () => {
    const positive = simulate(input({ categories: [category([200, 200, 200])] }))
    expect(positive.months[0].probNegative).toBe(0)

    const negative = simulate(
      input({ openingBalance: 100, categories: [category([500, 500, 500])] })
    )
    expect(negative.months[0].probNegative).toBe(1)
  })

  test("percentis são monotônicos em toda a saída", () => {
    const result = simulate(
      input({
        months: horizonMonths(1, 2026, 6).map((m) => plan(m)),
        categories: [
          category([100, 900, 300, 1500, 200, 700, 400, 1100, 50, 600, 800, 250]),
          category([50, 80, 20, 300, 10, 120], { categoryId: "c2", categoryName: "Lazer" }),
        ],
        runs: 2000,
      })
    )
    for (const month of result.months) {
      const { p10, p25, p50, p75, p90 } = month.balance
      expect(p10).toBeLessThanOrEqual(p25)
      expect(p25).toBeLessThanOrEqual(p50)
      expect(p50).toBeLessThanOrEqual(p75)
      expect(p75).toBeLessThanOrEqual(p90)
    }
  })

  test("mesma semente devolve resultado idêntico", () => {
    const build = () =>
      input({
        months: horizonMonths(1, 2026, 3).map((m) => plan(m)),
        categories: [category([100, 900, 300, 1500, 200, 700])],
        runs: 1000,
      })
    expect(simulate(build())).toEqual(simulate(build()))
  })

  test("sementes diferentes divergem", () => {
    const build = (seed: number) =>
      simulate(
        input({
          months: horizonMonths(1, 2026, 3).map((m) => plan(m)),
          categories: [
            category([100, 900, 300, 1500, 200, 700, 400, 1100, 50, 600]),
          ],
          runs: 1000,
          seed,
        })
      )
    expect(build(1)).not.toEqual(build(2))
  })

  test("5 000 iterações rodam em menos de 500ms", () => {
    const started = Date.now()
    simulate(
      input({
        months: horizonMonths(1, 2026, 6).map((m) => plan(m)),
        categories: Array.from({ length: 15 }, (_, i) =>
          category([100, 900, 300, 1500, 200, 700, 400, 1100, 50, 600, 800, 250], {
            categoryId: `c${i}`,
            categoryName: `Cat ${i}`,
          })
        ),
        runs: SIMULATION_RUNS,
      })
    )
    expect(Date.now() - started).toBeLessThan(500)
  })

  test("receita entra somando e despesa subtraindo", () => {
    const result = simulate(
      input({
        months: [plan({ expectedIncome: 5000, fixedExpenses: 2000, knownTransactions: 300 })],
      })
    )
    expect(result.months[0].balance.p50).toBe(12700) // 10000 + 5000 - 2000 - 300
  })

  test("remainingFraction escala só os componentes estocásticos", () => {
    const full = simulate(input({ categories: [category([1000, 1000, 1000])] }))
    const half = simulate(
      input({
        months: [plan({ remainingFraction: 0.5 })],
        categories: [category([1000, 1000, 1000])],
      })
    )
    expect(full.months[0].balance.p50).toBe(9000)
    expect(half.months[0].balance.p50).toBe(9500)
  })

  test("categoria de baixa confiança vira constante igual à média", () => {
    const result = simulate(
      input({ categories: [category([0, 0, 300], { lowConfidence: true })] })
    )
    expect(result.months[0].balance.p10).toBe(result.months[0].balance.p90)
    expect(result.months[0].balance.p50).toBe(9900) // 10000 - 100
  })

  test("o resumo aponta o pior mês pelo p10", () => {
    const result = simulate(
      input({
        months: [
          plan({ month: 1, label: "jan/26" }),
          plan({ month: 2, label: "fev/26", fixedExpenses: 9000 }),
          plan({ month: 3, label: "mar/26", expectedIncome: 9000 }),
        ],
      })
    )
    expect(result.summary.worstMonthLabel).toBe("fev/26")
    expect(result.summary.endBalanceP50).toBe(10000)
  })

  test("probAnyNegative considera qualquer mês do horizonte", () => {
    const result = simulate(
      input({
        openingBalance: 1000,
        months: [
          plan({ month: 1, label: "jan/26", fixedExpenses: 2000 }),
          plan({ month: 2, label: "fev/26", expectedIncome: 5000 }),
        ],
      })
    )
    // Fecha positivo no fim, mas passou pelo vermelho no caminho
    expect(result.months[1].balance.p50).toBeGreaterThan(0)
    expect(result.summary.probAnyNegative).toBe(1)
  })
})

describe("helpers de mês", () => {
  test("monthLabel em pt-BR abreviado", () => {
    expect(monthLabel(10, 2026)).toBe("out/26")
  })

  test("monthKey é YYYY-MM", () => {
    expect(monthKey(3, 2026)).toBe("2026-03")
  })

  test("horizonMonths atravessa o ano", () => {
    const horizon = horizonMonths(11, 2026, 3)
    expect(horizon.map((m) => m.key)).toEqual(["2026-11", "2026-12", "2027-01"])
  })
})
