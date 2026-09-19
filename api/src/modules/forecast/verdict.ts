// Veredito do "posso comprar?" e os acionáveis.
//
// O veredito é **determinístico** — não é a IA que decide. A IA, quando existe,
// só traduz a frase do usuário em parâmetros de formulário (ver parse.ts).

import { monthKey } from "./montecarlo"
import type {
  AffordabilityActions,
  AffordabilityVerdict,
  ProjectionSummary,
  ScenarioEvent,
  Verdict,
} from "./types"

/** Limiares de `probAnyNegative`. Exportados para o teste bater nos extremos. */
export const VERDICT_THRESHOLDS = {
  tight: 0.05,
  risky: 0.25,
  no: 0.6,
} as const

function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

/**
 * Classifica o risco do cenário.
 *
 * `p50Negative` é true quando o saldo mediano fica negativo em algum mês — é um
 * caso pior que a probabilidade sozinha sugere, porque significa que o resultado
 * *típico* já é vermelho.
 */
export function classifyVerdict(
  summary: ProjectionSummary,
  minimumReserveBrl: number,
  p50Negative: boolean
): AffordabilityVerdict {
  const { probAnyNegative, minBalanceP10 } = summary
  const reserveBroken = minBalanceP10 < minimumReserveBrl

  let verdict: Verdict
  let reason: string

  if (p50Negative || probAnyNegative >= VERDICT_THRESHOLDS.no) {
    verdict = "no"
    reason = p50Negative
      ? "No cenário mais provável o saldo fica negativo em algum mês."
      : `${formatPct(probAnyNegative)} de chance de o saldo ficar negativo durante o período.`
  } else if (probAnyNegative >= VERDICT_THRESHOLDS.risky) {
    verdict = "risky"
    reason = `${formatPct(probAnyNegative)} de chance de o saldo ficar negativo durante o período.`
  } else if (probAnyNegative >= VERDICT_THRESHOLDS.tight || reserveBroken) {
    verdict = "tight"
    reason = reserveBroken
      ? `O saldo pode cair para ${formatBrl(minBalanceP10)}, abaixo da sua reserva de ${formatBrl(minimumReserveBrl)}.`
      : `${formatPct(probAnyNegative)} de chance de o saldo ficar negativo durante o período.`
  } else {
    verdict = "safe"
    reason = `Mesmo no cenário pessimista o saldo não cai abaixo de ${formatBrl(minBalanceP10)}.`
  }

  return {
    verdict,
    probAnyNegative,
    minBalanceP10,
    minimumReserveBrl,
    reason,
  }
}

/** `safe` e `tight` são aceitáveis; `risky` e `no` não. */
export function isAcceptable(verdict: Verdict): boolean {
  return verdict === "safe" || verdict === "tight"
}

/**
 * Roda uma simulação e devolve o veredito. Injetado como callback para manter
 * este arquivo puro — quem tem acesso ao banco é o `service.ts`.
 */
export type SimulateFn = (events: ScenarioEvent[]) => {
  summary: ProjectionSummary
  p50Negative: boolean
}

export interface ActionsInput {
  simulate: SimulateFn
  baseEvent: Extract<ScenarioEvent, { kind: "installment_purchase" }>
  horizon: { month: number; year: number }[]
  minimumReserveBrl: number
}

/** Precisão da busca binária do teto, em reais. */
const AFFORD_PRECISION = 50
const MAX_BISECTION_STEPS = 24

/**
 * Acionáveis calculados, não opinados:
 *
 * - `maxAffordableTotal`: busca binária sobre `totalAmount` até o limite em que
 *   o veredito ainda é aceitável.
 * - `saferInstallments`: menor número de parcelas que devolve `safe`.
 * - `bestStartMonth`: mês de início, dentro do horizonte, com o melhor p10.
 */
export function computeActions(input: ActionsInput): AffordabilityActions {
  const { simulate, baseEvent, horizon, minimumReserveBrl } = input

  const verdictFor = (event: ScenarioEvent) => {
    const result = simulate([event])
    return classifyVerdict(result.summary, minimumReserveBrl, result.p50Negative)
      .verdict
  }

  // ── Teto ────────────────────────────────────────────────────────────────────
  let maxAffordableTotal: number | null = null
  if (isAcceptable(verdictFor({ ...baseEvent, totalAmount: baseEvent.totalAmount }))) {
    // Já cabe: procura para cima até deixar de caber
    let low = baseEvent.totalAmount
    let high = baseEvent.totalAmount * 2 || AFFORD_PRECISION
    let steps = 0
    while (
      isAcceptable(verdictFor({ ...baseEvent, totalAmount: high })) &&
      steps++ < 12
    ) {
      low = high
      high *= 2
    }
    maxAffordableTotal = bisect(low, high, verdictFor, baseEvent)
  } else {
    // Não cabe: procura para baixo o maior valor que caberia
    maxAffordableTotal = bisect(0, baseEvent.totalAmount, verdictFor, baseEvent)
  }

  // ── Parcelas mais seguras ───────────────────────────────────────────────────
  let saferInstallments: number | null = null
  for (const n of [1, 2, 3, 6, 10, 12, 18, 24]) {
    if (n < baseEvent.installments) continue
    if (verdictFor({ ...baseEvent, installments: n }) === "safe") {
      saferInstallments = n
      break
    }
  }

  // ── Melhor mês de início ────────────────────────────────────────────────────
  let bestStartMonth: string | null = null
  let bestP10 = -Infinity
  for (const month of horizon) {
    const key = monthKey(month.month, month.year)
    const result = simulate([{ ...baseEvent, startMonth: key }])
    if (result.summary.minBalanceP10 > bestP10) {
      bestP10 = result.summary.minBalanceP10
      bestStartMonth = key
    }
  }

  return {
    maxAffordableTotal:
      maxAffordableTotal === null ? null : Math.floor(maxAffordableTotal),
    saferInstallments,
    bestStartMonth,
  }
}

/** Maior valor em [low, high] cujo veredito ainda é aceitável. */
function bisect(
  low: number,
  high: number,
  verdictFor: (event: ScenarioEvent) => Verdict,
  baseEvent: Extract<ScenarioEvent, { kind: "installment_purchase" }>
): number {
  let steps = 0
  while (high - low > AFFORD_PRECISION && steps++ < MAX_BISECTION_STEPS) {
    const middle = (low + high) / 2
    if (isAcceptable(verdictFor({ ...baseEvent, totalAmount: middle }))) {
      low = middle
    } else {
      high = middle
    }
  }
  return low
}
