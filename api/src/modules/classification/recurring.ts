// Detector de cobranças recorrentes (assinaturas, mensalidades, financiamentos).
//
// A tabela `recurring_series` é um cache derivado de `transactions`: pode ser
// apagada e recalculada a qualquer momento. A única exceção é `dismissed`, que
// o upsert do recálculo preserva.

import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "../../db"
import {
  recurringSeries,
  transactions,
  type RecurringStatus,
} from "../../db/schema"
import { addDays, daysBetween, coefficientOfVariation, median } from "../../lib/stats"
import { merchantKey } from "./normalize"

/** Menos que isto não é padrão, é coincidência. */
export const MIN_OCCURRENCES = 3
/** Regularidade: desvio dos intervalos em relação à mediana. */
export const INTERVAL_TOLERANCE = 0.2
/** Estabilidade de valor: deixa passar reajuste, barra supermercado. */
export const AMOUNT_CV_MAX = 0.25
/** Aumento a partir do qual a série é marcada como reajustada. */
export const PRICE_CHANGE_THRESHOLD = 0.05
/** Folga antes de considerar a cobrança atrasada. */
export const OVERDUE_GRACE_DAYS = 5

interface Cycle {
  days: number
  label: "weekly" | "monthly" | "quarterly" | "yearly"
}

/** Mediana dos intervalos → ciclo nomeado. Fora das faixas, não é recorrência. */
export function classifyCycle(medianInterval: number): Cycle | null {
  if (medianInterval >= 6 && medianInterval <= 8)
    return { days: 7, label: "weekly" }
  if (medianInterval >= 26 && medianInterval <= 35)
    return { days: 30, label: "monthly" }
  if (medianInterval >= 84 && medianInterval <= 100)
    return { days: 90, label: "quarterly" }
  if (medianInterval >= 350 && medianInterval <= 380)
    return { days: 365, label: "yearly" }
  return null
}

export interface ChargeInput {
  /** Descrição crua — a chave é derivada dela. */
  name: string
  /** YYYY-MM-DD. */
  date: string
  /** Magnitude positiva (despesa). */
  amount: number
  categoryId?: string | null
}

export interface DetectedSeries {
  merchantKey: string
  label: string
  categoryId: string | null
  intervalDays: number
  cycle: Cycle["label"]
  occurrences: number
  averageAmount: number
  firstAmount: number
  lastAmount: number
  firstChargeDate: string
  lastChargeDate: string
  expectedNextDate: string
  status: RecurringStatus
}

/**
 * Status pela distância até a próxima cobrança prevista:
 * ACTIVE dentro da janela + folga, OVERDUE até 2 ciclos, CANCELLED depois.
 */
export function resolveStatus(
  expectedNextDate: string,
  intervalDays: number,
  today: string
): RecurringStatus {
  const late = daysBetween(expectedNextDate, today)
  if (late <= OVERDUE_GRACE_DAYS) return "ACTIVE"
  if (late <= intervalDays * 2) return "OVERDUE"
  return "CANCELLED"
}

/**
 * Agrupa por `merchantKey` e devolve as séries que passam nos filtros de
 * regularidade (intervalo) e estabilidade (valor). Função pura — coberta por
 * recurring.test.ts.
 */
export function detectSeries(
  charges: ChargeInput[],
  today = new Date().toISOString().slice(0, 10)
): DetectedSeries[] {
  const groups = new Map<string, ChargeInput[]>()
  for (const charge of charges) {
    if (charge.amount <= 0) continue // entradas não são assinatura
    const key = merchantKey(charge.name)
    if (!key) continue
    const bucket = groups.get(key)
    if (bucket) bucket.push(charge)
    else groups.set(key, [charge])
  }

  const series: DetectedSeries[] = []

  for (const [key, rawBucket] of groups) {
    if (rawBucket.length < MIN_OCCURRENCES) continue

    const bucket = [...rawBucket].sort((a, b) => a.date.localeCompare(b.date))

    const intervals: number[] = []
    for (let i = 1; i < bucket.length; i++) {
      intervals.push(daysBetween(bucket[i - 1].date, bucket[i].date))
    }
    const medianInterval = median(intervals)
    if (medianInterval === null || medianInterval <= 0) continue

    const cycle = classifyCycle(medianInterval)
    if (!cycle) continue

    // Regularidade: o desvio absoluto médio dos intervalos contra a mediana
    const intervalDeviation =
      intervals.reduce((sum, v) => sum + Math.abs(v - medianInterval), 0) /
      intervals.length
    if (intervalDeviation > medianInterval * INTERVAL_TOLERANCE) continue

    const amounts = bucket.map((c) => c.amount)
    const cv = coefficientOfVariation(amounts)
    if (cv === null || cv > AMOUNT_CV_MAX) continue

    const lastChargeDate = bucket[bucket.length - 1].date
    const expectedNextDate = addDays(lastChargeDate, cycle.days)

    series.push({
      merchantKey: key,
      // O nome mais recente é o rótulo — costuma ser o mais limpo
      label: bucket[bucket.length - 1].name,
      categoryId: bucket[bucket.length - 1].categoryId ?? null,
      intervalDays: cycle.days,
      cycle: cycle.label,
      occurrences: bucket.length,
      averageAmount:
        amounts.reduce((sum, v) => sum + v, 0) / amounts.length,
      firstAmount: amounts[0],
      lastAmount: amounts[amounts.length - 1],
      firstChargeDate: bucket[0].date,
      lastChargeDate,
      expectedNextDate,
      status: resolveStatus(expectedNextDate, cycle.days, today),
    })
  }

  return series.sort((a, b) => b.averageAmount - a.averageAmount)
}

// ── Sinais derivados (calculados na consulta, não persistidos) ────────────────

/** Custo mensal normalizado: permite somar assinatura anual com mensal. */
export function monthlyCost(averageAmount: number, intervalDays: number) {
  return (averageAmount * 30) / intervalDays
}

/** Aumento de preço acima de `PRICE_CHANGE_THRESHOLD`, ou `null`. */
export function priceChangePct(
  firstAmount: number,
  lastAmount: number
): number | null {
  if (firstAmount <= 0) return null
  const change = (lastAmount - firstAmount) / firstAmount
  return change > PRICE_CHANGE_THRESHOLD ? change : null
}

// ── Persistência ─────────────────────────────────────────────────────────────

export interface RecalculateResult {
  detected: number
  updated: number
  removed: number
}

/**
 * Recalcula as séries de uma carteira (ou do escopo global quando `walletId`
 * é null) e sincroniza a tabela. `dismissed` sobrevive ao recálculo.
 */
export async function recalculate(
  walletId: string | null
): Promise<RecalculateResult> {
  const scope = walletId
    ? eq(transactions.walletId, walletId)
    : isNull(transactions.walletId)

  const rows = await db
    .select({
      name: transactions.name,
      date: transactions.date,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(scope, sql`${transactions.amount}::numeric > 0`))

  const detected = detectSeries(
    rows.map((r) => ({
      name: r.name,
      date: r.date,
      amount: Number(r.amount),
      categoryId: r.categoryId,
    }))
  )

  const walletScope = walletId
    ? eq(recurringSeries.walletId, walletId)
    : isNull(recurringSeries.walletId)

  const existing = await db
    .select({
      id: recurringSeries.id,
      merchantKey: recurringSeries.merchantKey,
      dismissed: recurringSeries.dismissed,
    })
    .from(recurringSeries)
    .where(walletScope)

  const existingByKey = new Map(existing.map((e) => [e.merchantKey, e]))
  const detectedKeys = new Set(detected.map((s) => s.merchantKey))

  let updated = 0
  for (const serie of detected) {
    const values = {
      merchantKey: serie.merchantKey,
      label: serie.label.slice(0, 255),
      categoryId: serie.categoryId,
      walletId,
      intervalDays: serie.intervalDays,
      occurrences: serie.occurrences,
      averageAmount: serie.averageAmount.toFixed(2),
      lastAmount: serie.lastAmount.toFixed(2),
      firstAmount: serie.firstAmount.toFixed(2),
      firstChargeDate: serie.firstChargeDate,
      lastChargeDate: serie.lastChargeDate,
      expectedNextDate: serie.expectedNextDate,
      status: serie.status,
    }

    const found = existingByKey.get(serie.merchantKey)
    if (found) {
      // `dismissed` não entra no set: a escolha do usuário sobrevive
      await db
        .update(recurringSeries)
        .set(values)
        .where(eq(recurringSeries.id, found.id))
      updated++
    } else {
      await db.insert(recurringSeries).values(values)
    }
  }

  // Séries que deixaram de existir (transações apagadas/editadas) somem —
  // exceto as que o usuário já dispensou, para não voltarem a ser sugeridas.
  let removed = 0
  for (const row of existing) {
    if (detectedKeys.has(row.merchantKey) || row.dismissed) continue
    await db.delete(recurringSeries).where(eq(recurringSeries.id, row.id))
    removed++
  }

  return { detected: detected.length, updated, removed }
}

// Recálculo em rajada (importação de CSV) colapsa num único disparo.
const pending = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 5000

/** Agenda o recálculo com debounce. Erros são logados, nunca propagados. */
export function scheduleRecalculate(walletId: string | null) {
  const key = walletId ?? "__global__"
  const existing = pending.get(key)
  if (existing) clearTimeout(existing)
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key)
      recalculate(walletId).catch((err) =>
        console.error("[classification] falha ao recalcular recorrências", err)
      )
    }, DEBOUNCE_MS)
  )
}
