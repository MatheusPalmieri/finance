// Aplica ScenarioEvent[] sobre os meses da projeção. Puro.
//
// Convenção: o impacto de um mês é positivo quando reduz o saldo (saída) e
// negativo quando aumenta (entrada) — igual a `MonthPlan.scenarioImpact`.

import { installmentAmount } from "./installments"
import { monthKey } from "./montecarlo"
import type { MonthPlan, ScenarioEvent } from "./types"

interface HorizonMonth {
  month: number
  year: number
  key: string
}

/** Índice do mês no horizonte, ou -1 se estiver fora. */
function indexOfMonth(horizon: HorizonMonth[], key: string | undefined): number {
  if (!key) return -1
  return horizon.findIndex((m) => m.key === key)
}

/**
 * Impacto de cada evento, mês a mês. Devolve um array do tamanho do horizonte.
 * Eventos que caem fora do horizonte são ignorados (parcelas que começam depois
 * do fim, por exemplo) — a projeção só responde pelo que consegue ver.
 */
export function scenarioImpacts(
  horizon: HorizonMonth[],
  events: ScenarioEvent[]
): number[] {
  const impacts = new Array<number>(horizon.length).fill(0)
  // Default de "próximo mês": o segundo do horizonte, já que o primeiro é o
  // mês corrente. Com horizonte de 1 mês, cai no próprio mês corrente.
  const defaultStart = horizon.length > 1 ? 1 : 0

  for (const event of events) {
    switch (event.kind) {
      case "installment_purchase": {
        const start = resolveStart(horizon, event.startMonth, defaultStart)
        if (start === null) break
        const amount = installmentAmount(
          event.totalAmount,
          event.installments,
          event.monthlyInterestPct ?? 0
        )
        for (let n = 0; n < event.installments; n++) {
          const index = start + n
          if (index >= horizon.length) break
          impacts[index] += amount
        }
        break
      }

      case "recurring_change": {
        const start = resolveStart(horizon, event.startMonth, defaultStart)
        if (start === null) break
        const endIndex = indexOfMonth(horizon, event.endMonth)
        const last = endIndex === -1 ? horizon.length - 1 : endIndex
        for (let index = start; index <= last; index++) {
          impacts[index] += event.monthlyAmount
        }
        break
      }

      case "one_off": {
        const index = indexOfMonth(horizon, event.month)
        if (index === -1) break
        impacts[index] += event.amount
        break
      }

      case "income_change": {
        const start = resolveStart(horizon, event.startMonth, defaultStart)
        if (start === null) break
        // Receita a mais reduz o impacto (que é medido como saída)
        for (let index = start; index < horizon.length; index++) {
          impacts[index] -= event.monthlyAmount
        }
        break
      }
    }
  }

  return impacts
}

/**
 * Resolve o mês de início. Um `startMonth` anterior ao horizonte é tratado como
 * o primeiro mês (a cobrança já está correndo); posterior ao horizonte devolve
 * `null` (não há o que projetar).
 */
function resolveStart(
  horizon: HorizonMonth[],
  startMonth: string | undefined,
  fallback: number
): number | null {
  if (!startMonth) return fallback
  const index = indexOfMonth(horizon, startMonth)
  if (index !== -1) return index
  return startMonth < horizon[0].key ? 0 : null
}

/** Devolve uma cópia dos meses com o impacto do cenário aplicado. */
export function applyScenario(
  months: MonthPlan[],
  events: ScenarioEvent[]
): MonthPlan[] {
  const impacts = scenarioImpacts(
    months.map((m) => ({ month: m.month, year: m.year, key: monthKey(m.month, m.year) })),
    events
  )
  return months.map((plan, i) => ({
    ...plan,
    scenarioImpact: plan.scenarioImpact + impacts[i],
  }))
}
