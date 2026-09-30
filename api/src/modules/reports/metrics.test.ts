import { describe, expect, test } from "bun:test"
import {
  buildDistribution,
  classifyAnomaly,
  classifyBudgetStatus,
  countNoSpendDays,
  monthRange,
  nullableScalar,
  previousMonth,
  scalar,
  shiftMonth,
} from "./metrics"

describe("monthRange", () => {
  test("mês de 30 dias", () => {
    expect(monthRange(2026, 11)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      days: 30,
    })
  })

  test("mês de 31 dias", () => {
    expect(monthRange(2026, 1).to).toBe("2026-01-31")
  })

  test("fevereiro bissexto", () => {
    expect(monthRange(2028, 2).days).toBe(29)
  })
})

describe("shiftMonth", () => {
  test("volta atravessando o ano", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
  })

  test("volta 6 meses", () => {
    expect(shiftMonth(2026, 3, -5)).toEqual({ year: 2025, month: 10 })
  })

  test("avança atravessando o ano", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
  })

  test("previousMonth é o atalho de -1", () => {
    expect(previousMonth(2026, 5)).toEqual({ year: 2026, month: 4 })
  })
})

describe("scalar", () => {
  test("calcula a variação percentual", () => {
    expect(scalar(150, 100).deltaPct).toBe(50)
  })

  test("mês anterior zerado não vira infinito", () => {
    expect(scalar(150, 0).deltaPct).toBeNull()
  })

  test("queda dá variação negativa", () => {
    expect(scalar(50, 100).deltaPct).toBe(-50)
  })

  test("nullableScalar propaga null", () => {
    expect(nullableScalar(null, 10).current).toBeNull()
    expect(nullableScalar(null, 10).deltaPct).toBeNull()
  })
})

describe("countNoSpendDays", () => {
  test("mês de 30 dias com gasto em 3 dias", () => {
    expect(
      countNoSpendDays(30, ["2026-11-01", "2026-11-02", "2026-11-03"])
    ).toBe(27)
  })

  test("mês de 31 dias", () => {
    expect(countNoSpendDays(31, ["2026-01-05"])).toBe(30)
  })

  test("várias transações no mesmo dia contam uma vez", () => {
    expect(countNoSpendDays(30, ["2026-11-01", "2026-11-01"])).toBe(29)
  })

  test("mês sem nenhuma despesa", () => {
    expect(countNoSpendDays(30, [])).toBe(30)
  })
})

describe("classifyBudgetStatus", () => {
  const exact = {
    amountType: "exact" as const,
    amount: "1000",
    amountMin: null,
    amountMax: null,
  }
  const range = {
    amountType: "range" as const,
    amount: null,
    amountMin: "500",
    amountMax: "800",
  }

  test("sem lançamento no mês vira missing", () => {
    expect(classifyBudgetStatus(exact, 0, 0)).toBe("missing")
  })

  test("exato dentro da tolerância de 2% fica on_track", () => {
    expect(classifyBudgetStatus(exact, 1010, 1)).toBe("on_track")
  })

  test("exato acima da tolerância estoura", () => {
    expect(classifyBudgetStatus(exact, 1030, 1)).toBe("over")
  })

  test("exato bem abaixo fica under", () => {
    expect(classifyBudgetStatus(exact, 900, 1)).toBe("under")
  })

  test("faixa: dentro dela fica on_track", () => {
    expect(classifyBudgetStatus(range, 650, 3)).toBe("on_track")
  })

  test("R$ 0,01 acima do máximo estoura", () => {
    expect(classifyBudgetStatus(range, 800.01, 3)).toBe("over")
  })

  test("abaixo do mínimo fica under", () => {
    expect(classifyBudgetStatus(range, 499.99, 3)).toBe("under")
  })
})

describe("buildDistribution", () => {
  test("a base é a renda: distribuição na meta zera o desvio", () => {
    const dist = buildDistribution({ essential: 500, variable: 300, investment: 200 }, 1000)
    expect(dist.essential.pct).toBe(50)
    expect(dist.essential.deltaPp).toBe(0)
    expect(dist.variable.deltaPp).toBe(0)
  })

  test("desvio em pontos percentuais da renda", () => {
    const dist = buildDistribution({ essential: 700, variable: 300, investment: 0 }, 1000)
    expect(dist.essential.deltaPp).toBe(20)
    expect(dist.investment.deltaPp).toBe(-20)
  })

  test("o que sobra da renda não entra em grupo nenhum", () => {
    const dist = buildDistribution({ essential: 400, variable: 100, investment: 0 }, 2000)
    expect(dist.essential.pct).toBe(20)
    expect(dist.variable.pct).toBe(5)
  })

  test("mês sem renda não divide por zero", () => {
    const dist = buildDistribution({ essential: 300, variable: 0, investment: 0 }, 0)
    expect(dist.essential.pct).toBe(0)
    expect(dist.essential.amountBrl).toBe(300)
  })
})

describe("classifyAnomaly", () => {
  test("z alto é high", () => {
    expect(classifyAnomaly(4)).toBe("high")
  })

  test("z médio é medium", () => {
    expect(classifyAnomaly(2.5)).toBe("medium")
  })

  test("z bem negativo é economia", () => {
    expect(classifyAnomaly(-3)).toBe("saving")
  })

  test("variação normal não entra no relatório", () => {
    expect(classifyAnomaly(1.2)).toBeNull()
    expect(classifyAnomaly(-1.2)).toBeNull()
  })
})
