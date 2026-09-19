import { describe, expect, test } from "bun:test"
import {
  classifyCycle,
  detectSeries,
  monthlyCost,
  priceChangePct,
  resolveStatus,
  type ChargeInput,
} from "./recurring"

const TODAY = "2026-04-10"

function monthly(
  name: string,
  amounts: number[],
  startMonth = 1
): ChargeInput[] {
  return amounts.map((amount, i) => ({
    name,
    amount,
    date: `2026-${String(startMonth + i).padStart(2, "0")}-05`,
  }))
}

describe("classifyCycle", () => {
  test("mensal", () => {
    expect(classifyCycle(30)?.days).toBe(30)
    expect(classifyCycle(28)?.days).toBe(30)
  })

  test("semanal, trimestral e anual", () => {
    expect(classifyCycle(7)?.label).toBe("weekly")
    expect(classifyCycle(91)?.label).toBe("quarterly")
    expect(classifyCycle(365)?.label).toBe("yearly")
  })

  test("fora das faixas não é recorrência", () => {
    expect(classifyCycle(15)).toBeNull()
    expect(classifyCycle(200)).toBeNull()
  })
})

describe("detectSeries", () => {
  test("3 cobranças mensais regulares viram série", () => {
    const series = detectSeries(monthly("Netflix", [55.9, 55.9, 55.9]), TODAY)
    expect(series).toHaveLength(1)
    expect(series[0].merchantKey).toBe("netflix")
    expect(series[0].intervalDays).toBe(30)
    expect(series[0].occurrences).toBe(3)
  })

  test("2 cobranças não viram série", () => {
    expect(detectSeries(monthly("Netflix", [55.9, 55.9]), TODAY)).toHaveLength(0)
  })

  test("variação de valor de 40% não vira série", () => {
    const series = detectSeries(monthly("Mercado", [100, 140, 60]), TODAY)
    expect(series).toHaveLength(0)
  })

  test("intervalos irregulares não viram série", () => {
    const charges: ChargeInput[] = [
      { name: "Loja", amount: 50, date: "2026-01-05" },
      { name: "Loja", amount: 50, date: "2026-02-04" },
      { name: "Loja", amount: 50, date: "2026-02-20" },
    ]
    expect(detectSeries(charges, TODAY)).toHaveLength(0)
  })

  test("entradas são ignoradas", () => {
    const charges = monthly("Salário", [-5000, -5000, -5000])
    expect(detectSeries(charges, TODAY)).toHaveLength(0)
  })

  test("variações da mesma loja caem na mesma série", () => {
    const charges: ChargeInput[] = [
      { name: "UBER *TRIP 8821", amount: 25, date: "2026-01-05" },
      { name: "UBER* TRIP SP", amount: 26, date: "2026-02-05" },
      { name: "Uber *Trip 4410", amount: 25.5, date: "2026-03-05" },
    ]
    const series = detectSeries(charges, TODAY)
    expect(series).toHaveLength(1)
    expect(series[0].occurrences).toBe(3)
  })

  test("prevê a próxima cobrança e fica ACTIVE", () => {
    const series = detectSeries(
      monthly("Netflix", [55.9, 55.9, 55.9], 2),
      TODAY
    )
    expect(series[0].lastChargeDate).toBe("2026-04-05")
    expect(series[0].expectedNextDate).toBe("2026-05-05")
    expect(series[0].status).toBe("ACTIVE")
  })

  test("série parada há meses fica CANCELLED", () => {
    const series = detectSeries(monthly("Netflix", [55.9, 55.9, 55.9]), "2026-09-10")
    expect(series[0].status).toBe("CANCELLED")
  })

  test("ordena pelo valor médio", () => {
    const series = detectSeries(
      [...monthly("Netflix", [55, 55, 55]), ...monthly("Aluguel", [2000, 2000, 2000])],
      TODAY
    )
    expect(series[0].merchantKey).toBe("aluguel")
  })
})

describe("resolveStatus", () => {
  test("dentro da folga de 5 dias ainda é ACTIVE", () => {
    expect(resolveStatus("2026-04-05", 30, "2026-04-10")).toBe("ACTIVE")
  })

  test("passou da folga vira OVERDUE", () => {
    expect(resolveStatus("2026-04-05", 30, "2026-04-20")).toBe("OVERDUE")
  })

  test("mais de 2 ciclos vira CANCELLED", () => {
    expect(resolveStatus("2026-01-05", 30, "2026-04-10")).toBe("CANCELLED")
  })
})

describe("sinais derivados", () => {
  test("aumento de 5,01% acusa priceChangePct", () => {
    expect(priceChangePct(100, 105.01)).toBeCloseTo(0.0501, 4)
  })

  test("aumento de exatamente 5% não acusa", () => {
    expect(priceChangePct(100, 105)).toBeNull()
  })

  test("queda de preço não acusa", () => {
    expect(priceChangePct(100, 90)).toBeNull()
  })

  test("custo mensal normaliza anual e mensal na mesma unidade", () => {
    expect(monthlyCost(120, 365)).toBeCloseTo(9.86, 2)
    expect(monthlyCost(55.9, 30)).toBeCloseTo(55.9, 2)
  })
})
