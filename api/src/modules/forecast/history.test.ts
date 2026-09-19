import { describe, expect, test } from "bun:test"
import {
  acceptedTrend,
  buildCategorySeries,
  detectRecurringIncome,
  linearTrend,
  type MonthlyTotalRow,
} from "./history"

const MONTHS = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
]

describe("linearTrend", () => {
  test("série crescente tem inclinação positiva e R² alto", () => {
    const trend = linearTrend([100, 110, 120, 130, 140, 150])
    expect(trend!.monthlyPct).toBeGreaterThan(0)
    expect(trend!.r2).toBeCloseTo(1, 6)
  })

  test("série constante não tem tendência", () => {
    expect(linearTrend([100, 100, 100, 100])).toBeNull()
  })

  test("menos de 3 pontos devolve null", () => {
    expect(linearTrend([100, 200])).toBeNull()
  })

  test("série com média zero devolve null", () => {
    expect(linearTrend([0, 0, 0, 0])).toBeNull()
  })
})

describe("acceptedTrend", () => {
  test("tendência forte e bem ajustada é aceita", () => {
    expect(acceptedTrend([100, 115, 130, 145, 160, 175])).not.toBeNull()
  })

  test("tendência fraca (< 3% ao mês) é ignorada", () => {
    // ~1% ao mês
    expect(acceptedTrend([100, 101, 102, 103, 104, 105])).toBeNull()
  })

  test("tendência com R² baixo é ignorada", () => {
    // Serra: cresce na média, mas explica mal
    expect(acceptedTrend([100, 900, 120, 800, 150, 700])).toBeNull()
  })
})

describe("buildCategorySeries", () => {
  function rows(...entries: [string, number][]): MonthlyTotalRow[] {
    return entries.map(([month, total]) => ({
      categoryId: "c1",
      categoryName: "Alimentação",
      month,
      total,
    }))
  }

  test("meses sem gasto entram como 0", () => {
    const [series] = buildCategorySeries(
      rows(["2026-01", 300], ["2026-04", 500]),
      MONTHS
    )
    expect(series.series).toEqual([300, 0, 0, 500, 0, 0])
  })

  test("a série tem sempre o tamanho da janela", () => {
    const [series] = buildCategorySeries(rows(["2026-01", 300]), MONTHS)
    expect(series.series).toHaveLength(MONTHS.length)
  })

  test("categoria com 2 meses de gasto vai para baixa confiança", () => {
    const [series] = buildCategorySeries(
      rows(["2026-01", 300], ["2026-02", 400]),
      MONTHS
    )
    expect(series.lowConfidence).toBe(true)
    // Baixa confiança nunca carrega tendência
    expect(series.trendMonthlyPct).toBeNull()
  })

  test("categoria com 3 meses de gasto já tem confiança", () => {
    const [series] = buildCategorySeries(
      rows(["2026-01", 300], ["2026-02", 400], ["2026-03", 350]),
      MONTHS
    )
    expect(series.lowConfidence).toBe(false)
  })

  test("separa categorias distintas", () => {
    const series = buildCategorySeries(
      [
        { categoryId: "c1", categoryName: "Zeta", month: "2026-01", total: 100 },
        { categoryId: "c2", categoryName: "Alfa", month: "2026-01", total: 200 },
      ],
      MONTHS
    )
    expect(series).toHaveLength(2)
    // Ordenadas por nome
    expect(series[0].categoryName).toBe("Alfa")
  })

  test("soma lançamentos do mesmo mês", () => {
    const [series] = buildCategorySeries(
      rows(["2026-01", 300], ["2026-01", 200]),
      MONTHS
    )
    expect(series.series[0]).toBe(500)
  })

  test("sem linhas devolve lista vazia", () => {
    expect(buildCategorySeries([], MONTHS)).toEqual([])
  })
})

describe("detectRecurringIncome", () => {
  function income(name: string, months: string[], amount: number) {
    return months.map((month) => ({ name, month, amount }))
  }

  test("receita em 4 de 6 meses é recorrente", () => {
    const result = detectRecurringIncome(
      income("Salário", ["2026-01", "2026-02", "2026-03", "2026-04"], 8000)
    )
    expect(result.sources).toHaveLength(1)
    expect(result.monthlyIncome).toBe(8000)
  })

  test("receita em 3 de 6 meses NÃO é recorrente", () => {
    const result = detectRecurringIncome(
      income("Freela", ["2026-01", "2026-02", "2026-03"], 2000)
    )
    expect(result.sources).toHaveLength(0)
    expect(result.monthlyIncome).toBe(0)
  })

  test("a média é sobre os meses em que ocorreu, não sobre a janela", () => {
    const result = detectRecurringIncome([
      ...income("Salário", ["2026-01", "2026-02", "2026-03"], 8000),
      { name: "Salário", month: "2026-04", amount: 4000 },
    ])
    expect(result.monthlyIncome).toBe(7000) // (8000*3 + 4000) / 4
  })

  test("variações do mesmo pagador caem na mesma fonte", () => {
    const result = detectRecurringIncome([
      { name: "PAG*Empresa LTDA", month: "2026-01", amount: 5000 },
      { name: "PAG* Empresa SP", month: "2026-02", amount: 5000 },
      { name: "PAG*Empresa 123", month: "2026-03", amount: 5000 },
      { name: "PAG*Empresa LTDA", month: "2026-04", amount: 5000 },
    ])
    expect(result.sources).toHaveLength(1)
    expect(result.monthlyIncome).toBe(5000)
  })

  test("soma fontes recorrentes diferentes", () => {
    const result = detectRecurringIncome([
      ...income("Salário", ["2026-01", "2026-02", "2026-03", "2026-04"], 8000),
      ...income("Aluguel recebido", ["2026-01", "2026-02", "2026-03", "2026-04"], 1500),
    ])
    expect(result.monthlyIncome).toBe(9500)
    expect(result.sources[0].label).toBe("Salário") // ordenado por valor
  })

  test("sem entradas devolve zero", () => {
    expect(detectRecurringIncome([]).monthlyIncome).toBe(0)
  })
})
