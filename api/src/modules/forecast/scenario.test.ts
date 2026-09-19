import { describe, expect, test } from "bun:test"
import { horizonMonths } from "./montecarlo"
import { scenarioImpacts } from "./scenario"
import type { ScenarioEvent } from "./types"

// Horizonte de 6 meses a partir de out/2026
const HORIZON = horizonMonths(10, 2026, 6)

function impacts(...events: ScenarioEvent[]) {
  return scenarioImpacts(HORIZON, events)
}

describe("installment_purchase", () => {
  test("10x sem juros aplica total/10 em 10 meses consecutivos", () => {
    // Horizonte de 12 meses para caber as 10 parcelas
    const long = horizonMonths(10, 2026, 12)
    const result = scenarioImpacts(long, [
      {
        kind: "installment_purchase",
        label: "Notebook",
        totalAmount: 4000,
        installments: 10,
        startMonth: "2026-11",
      },
    ])
    // Começa em nov (índice 1) e vai por 10 meses
    expect(result[0]).toBe(0)
    for (let i = 1; i <= 10; i++) expect(result[i]).toBeCloseTo(400, 10)
    expect(result[11]).toBe(0)
  })

  test("à vista cai num mês só", () => {
    const result = impacts({
      kind: "installment_purchase",
      label: "TV",
      totalAmount: 3000,
      installments: 1,
      startMonth: "2026-12",
    })
    expect(result[2]).toBe(3000)
    expect(result.filter((v) => v !== 0)).toHaveLength(1)
  })

  test("sem startMonth começa no próximo mês, não no corrente", () => {
    const result = impacts({
      kind: "installment_purchase",
      label: "Fone",
      totalAmount: 600,
      installments: 2,
    })
    expect(result[0]).toBe(0)
    expect(result[1]).toBe(300)
    expect(result[2]).toBe(300)
  })

  test("parcelas que passam do horizonte são truncadas", () => {
    const result = impacts({
      kind: "installment_purchase",
      label: "Carro",
      totalAmount: 24000,
      installments: 24,
      startMonth: "2026-10",
    })
    expect(result).toHaveLength(6)
    expect(result.every((v) => v === 1000)).toBe(true)
  })

  test("começo depois do horizonte não impacta nada", () => {
    const result = impacts({
      kind: "installment_purchase",
      label: "Futuro",
      totalAmount: 5000,
      installments: 3,
      startMonth: "2027-06",
    })
    expect(result.every((v) => v === 0)).toBe(true)
  })

  test("com juros a parcela é maior que a divisão simples", () => {
    const result = impacts({
      kind: "installment_purchase",
      label: "Com juros",
      totalAmount: 1000,
      installments: 5,
      monthlyInterestPct: 3,
      startMonth: "2026-10",
    })
    expect(result[0]).toBeGreaterThan(200)
  })
})

describe("recurring_change", () => {
  test("gasto novo vale do início ao fim do horizonte", () => {
    const result = impacts({
      kind: "recurring_change",
      label: "Academia",
      monthlyAmount: 120,
      startMonth: "2026-10",
    })
    expect(result.every((v) => v === 120)).toBe(true)
  })

  test("corte de gasto entra negativo", () => {
    const result = impacts({
      kind: "recurring_change",
      label: "Cortar streaming",
      monthlyAmount: -55,
      startMonth: "2026-10",
    })
    expect(result.every((v) => v === -55)).toBe(true)
  })

  test("endMonth encerra a recorrência", () => {
    const result = impacts({
      kind: "recurring_change",
      label: "Curso",
      monthlyAmount: 300,
      startMonth: "2026-10",
      endMonth: "2026-12",
    })
    expect(result.slice(0, 3).every((v) => v === 300)).toBe(true)
    expect(result.slice(3).every((v) => v === 0)).toBe(true)
  })

  test("cobrança que já está correndo começa no primeiro mês", () => {
    const result = impacts({
      kind: "recurring_change",
      label: "Antiga",
      monthlyAmount: 50,
      startMonth: "2026-01",
    })
    expect(result[0]).toBe(50)
  })
})

describe("one_off", () => {
  test("gasto único cai só no mês informado", () => {
    const result = impacts({
      kind: "one_off",
      label: "IPVA",
      amount: 1800,
      month: "2027-01",
    })
    expect(result[3]).toBe(1800)
    expect(result.filter((v) => v !== 0)).toHaveLength(1)
  })

  test("entrada única entra negativa", () => {
    const result = impacts({
      kind: "one_off",
      label: "13º",
      amount: -4000,
      month: "2026-12",
    })
    expect(result[2]).toBe(-4000)
  })

  test("mês fora do horizonte é ignorado", () => {
    const result = impacts({
      kind: "one_off",
      label: "Longe",
      amount: 500,
      month: "2028-01",
    })
    expect(result.every((v) => v === 0)).toBe(true)
  })
})

describe("income_change", () => {
  test("aumento de renda reduz o impacto (que mede saída)", () => {
    const result = impacts({
      kind: "income_change",
      label: "Aumento",
      monthlyAmount: 800,
      startMonth: "2026-11",
    })
    expect(result[0]).toBe(0)
    expect(result.slice(1).every((v) => v === -800)).toBe(true)
  })
})

describe("composição", () => {
  test("eventos empilham no mesmo mês", () => {
    const result = impacts(
      {
        kind: "recurring_change",
        label: "Academia",
        monthlyAmount: 120,
        startMonth: "2026-10",
      },
      {
        kind: "recurring_change",
        label: "Cortar streaming",
        monthlyAmount: -55,
        startMonth: "2026-10",
      }
    )
    expect(result.every((v) => v === 65)).toBe(true)
  })

  test("lista vazia não impacta nada", () => {
    expect(impacts().every((v) => v === 0)).toBe(true)
  })
})
