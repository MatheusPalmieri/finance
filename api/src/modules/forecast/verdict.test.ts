import { describe, expect, test } from "bun:test"
import {
  classifyVerdict,
  computeActions,
  isAcceptable,
  VERDICT_THRESHOLDS,
} from "./verdict"
import type { ProjectionSummary, ScenarioEvent } from "./types"

function summary(partial: Partial<ProjectionSummary> = {}): ProjectionSummary {
  return {
    endBalanceP50: 5000,
    worstMonthLabel: "out/26",
    minBalanceP10: 3000,
    probAnyNegative: 0,
    ...partial,
  }
}

const RESERVE = 1000

describe("classifyVerdict", () => {
  test("tudo tranquilo é safe", () => {
    expect(classifyVerdict(summary(), RESERVE, false).verdict).toBe("safe")
  })

  test("logo abaixo de 5% ainda é safe", () => {
    expect(
      classifyVerdict(summary({ probAnyNegative: 0.0499 }), RESERVE, false).verdict
    ).toBe("safe")
  })

  test("exatamente 5% já é tight", () => {
    expect(
      classifyVerdict(
        summary({ probAnyNegative: VERDICT_THRESHOLDS.tight }),
        RESERVE,
        false
      ).verdict
    ).toBe("tight")
  })

  test("exatamente 25% é risky", () => {
    expect(
      classifyVerdict(
        summary({ probAnyNegative: VERDICT_THRESHOLDS.risky }),
        RESERVE,
        false
      ).verdict
    ).toBe("risky")
  })

  test("exatamente 60% é no", () => {
    expect(
      classifyVerdict(
        summary({ probAnyNegative: VERDICT_THRESHOLDS.no }),
        RESERVE,
        false
      ).verdict
    ).toBe("no")
  })

  test("furar a reserva mínima derruba safe para tight", () => {
    const result = classifyVerdict(
      summary({ minBalanceP10: 500 }),
      RESERVE,
      false
    )
    expect(result.verdict).toBe("tight")
    expect(result.reason).toContain("reserva")
  })

  test("p50 negativo é no, independente da probabilidade", () => {
    const result = classifyVerdict(summary({ probAnyNegative: 0.1 }), RESERVE, true)
    expect(result.verdict).toBe("no")
    expect(result.reason).toContain("mais provável")
  })

  test("carrega os números usados na decisão", () => {
    const result = classifyVerdict(
      summary({ probAnyNegative: 0.3, minBalanceP10: -200 }),
      RESERVE,
      false
    )
    expect(result.probAnyNegative).toBe(0.3)
    expect(result.minBalanceP10).toBe(-200)
    expect(result.minimumReserveBrl).toBe(RESERVE)
  })
})

describe("isAcceptable", () => {
  test("safe e tight passam; risky e no não", () => {
    expect(isAcceptable("safe")).toBe(true)
    expect(isAcceptable("tight")).toBe(true)
    expect(isAcceptable("risky")).toBe(false)
    expect(isAcceptable("no")).toBe(false)
  })
})

describe("computeActions", () => {
  // Modelo de brinquedo: R$ 6 000 de folga distribuída no horizonte.
  // Qualquer compra acima disso fica negativa.
  const FOLGA = 6000

  function fakeSimulate(events: ScenarioEvent[]) {
    const event = events[0] as Extract<
      ScenarioEvent,
      { kind: "installment_purchase" }
    >
    // Quanto maior a parcela, menor o saldo — parcelar alivia, como na vida
    const perMonth = event.totalAmount / event.installments
    const minBalanceP10 = FOLGA - perMonth * 3
    return {
      summary: {
        endBalanceP50: minBalanceP10,
        worstMonthLabel: "out/26",
        minBalanceP10,
        probAnyNegative: minBalanceP10 < 0 ? 1 : 0,
      },
      p50Negative: minBalanceP10 < 0,
    }
  }

  const baseEvent: Extract<ScenarioEvent, { kind: "installment_purchase" }> = {
    kind: "installment_purchase",
    label: "Notebook",
    totalAmount: 4000,
    installments: 10,
    monthlyInterestPct: 0,
  }

  const horizon = [
    { month: 10, year: 2026 },
    { month: 11, year: 2026 },
    { month: 12, year: 2026 },
  ]

  test("a busca binária converge e o teto encontrado ainda é aceitável", () => {
    const actions = computeActions({
      simulate: fakeSimulate,
      baseEvent,
      horizon,
      minimumReserveBrl: 0,
    })

    expect(actions.maxAffordableTotal).not.toBeNull()
    const found = actions.maxAffordableTotal!

    // O valor encontrado realmente devolve um veredito aceitável ao ser simulado
    const at = fakeSimulate([{ ...baseEvent, totalAmount: found }])
    expect(
      isAcceptable(classifyVerdict(at.summary, 0, at.p50Negative).verdict)
    ).toBe(true)

    // E um pouco acima do teto deixa de ser aceitável
    const above = fakeSimulate([{ ...baseEvent, totalAmount: found + 500 }])
    expect(
      isAcceptable(classifyVerdict(above.summary, 0, above.p50Negative).verdict)
    ).toBe(false)
  })

  test("sugere um parcelamento que devolve safe", () => {
    const actions = computeActions({
      simulate: fakeSimulate,
      baseEvent: { ...baseEvent, totalAmount: 15000, installments: 1 },
      horizon,
      minimumReserveBrl: 0,
    })
    expect(actions.saferInstallments).not.toBeNull()
    expect(actions.saferInstallments!).toBeGreaterThanOrEqual(1)
  })

  test("nunca sugere menos parcelas do que as pedidas", () => {
    const actions = computeActions({
      simulate: fakeSimulate,
      baseEvent: { ...baseEvent, installments: 10 },
      horizon,
      minimumReserveBrl: 0,
    })
    if (actions.saferInstallments !== null) {
      expect(actions.saferInstallments).toBeGreaterThanOrEqual(10)
    }
  })

  test("escolhe um mês de início dentro do horizonte", () => {
    const actions = computeActions({
      simulate: fakeSimulate,
      baseEvent,
      horizon,
      minimumReserveBrl: 0,
    })
    expect(actions.bestStartMonth).not.toBeNull()
    expect(["2026-10", "2026-11", "2026-12"]).toContain(
      actions.bestStartMonth!
    )
  })

  test("gasto absurdo devolve teto baixo sem travar", () => {
    const started = Date.now()
    const actions = computeActions({
      simulate: fakeSimulate,
      baseEvent: { ...baseEvent, totalAmount: 500000, installments: 1 },
      horizon,
      minimumReserveBrl: 0,
    })
    expect(Date.now() - started).toBeLessThan(200)
    expect(actions.maxAffordableTotal!).toBeLessThan(500000)
  })
})
