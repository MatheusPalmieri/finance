// Séries históricas por categoria e receita recorrente.
//
// A parte matemática (`linearTrend`, `buildCategorySeries`,
// `detectRecurringIncome`) é pura e testada; só `loadHistory` toca o banco.

import { and, between, eq, sql } from "drizzle-orm"
import { db } from "../../db"
import { categories, transactions } from "../../db/schema"
import { merchantKey } from "../classification/normalize"
import type { CategorySeries } from "./types"

/** Quantos meses de histórico alimentam o bootstrap. */
export const HISTORY_MONTHS = 12
/** Abaixo disso a categoria entra como constante e é sinalizada. */
export const MIN_HISTORY_MONTHS = 3
/** Inclinação mínima (fração ao mês) para a tendência ser considerada. */
export const TREND_MIN_MONTHLY_PCT = 0.03
/** Ajuste mínimo da regressão. Extrapolar tendência fraca é o erro clássico. */
export const TREND_MIN_R2 = 0.5
/** Receita precisa aparecer em ao menos 4 dos 6 meses para ser recorrente. */
export const INCOME_LOOKBACK_MONTHS = 6
export const INCOME_MIN_OCCURRENCES = 4

export interface Trend {
  monthlyPct: number
  r2: number
}

/**
 * Regressão linear simples sobre a série. Devolve a inclinação como **fração da
 * média mensal** (comparável entre categorias de tamanhos diferentes) e o R².
 *
 * `null` quando não há pontos suficientes ou a média é zero.
 */
export function linearTrend(series: number[]): Trend | null {
  const n = series.length
  if (n < MIN_HISTORY_MONTHS) return null

  const meanX = (n - 1) / 2
  const meanY = series.reduce((sum, v) => sum + v, 0) / n
  if (meanY === 0) return null

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (i - meanX) * (series[i] - meanY)
    denominator += (i - meanX) ** 2
  }
  if (denominator === 0) return null

  const slope = numerator / denominator
  const intercept = meanY - slope * meanX

  let ssTotal = 0
  let ssResidual = 0
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i
    ssTotal += (series[i] - meanY) ** 2
    ssResidual += (series[i] - predicted) ** 2
  }
  // Série constante: variação zero, nada a explicar — sem tendência
  if (ssTotal === 0) return null

  return { monthlyPct: slope / Math.abs(meanY), r2: 1 - ssResidual / ssTotal }
}

/** Aplica os cortes de significância. `null` = sem tendência aproveitável. */
export function acceptedTrend(series: number[]): number | null {
  const trend = linearTrend(series)
  if (!trend) return null
  if (Math.abs(trend.monthlyPct) <= TREND_MIN_MONTHLY_PCT) return null
  if (trend.r2 <= TREND_MIN_R2) return null
  return trend.monthlyPct
}

export interface MonthlyTotalRow {
  categoryId: string
  categoryName: string
  month: string
  total: number
}

/**
 * Monta a série de 12 meses por categoria. **Meses sem gasto entram como 0** —
 * a ausência é informação, e descartá-los inflaria a projeção.
 */
export function buildCategorySeries(
  rows: MonthlyTotalRow[],
  monthKeys: string[]
): CategorySeries[] {
  const byCategory = new Map<
    string,
    { name: string; totals: Map<string, number> }
  >()

  for (const row of rows) {
    const entry = byCategory.get(row.categoryId) ?? {
      name: row.categoryName,
      totals: new Map<string, number>(),
    }
    entry.totals.set(row.month, (entry.totals.get(row.month) ?? 0) + row.total)
    byCategory.set(row.categoryId, entry)
  }

  const out: CategorySeries[] = []
  for (const [categoryId, entry] of byCategory) {
    const series = monthKeys.map((key) => entry.totals.get(key) ?? 0)
    // Quantos meses tiveram gasto de fato — é isto que mede a confiança,
    // não o tamanho da série (que é sempre 12 por construção).
    const monthsWithSpend = series.filter((v) => v > 0).length
    const lowConfidence = monthsWithSpend < MIN_HISTORY_MONTHS

    out.push({
      categoryId,
      categoryName: entry.name,
      series,
      lowConfidence,
      trendMonthlyPct: lowConfidence ? null : acceptedTrend(series),
    })
  }

  return out.sort((a, b) => a.categoryName.localeCompare(b.categoryName))
}

export interface IncomeRow {
  name: string
  month: string
  /** Magnitude positiva da entrada. */
  amount: number
}

/**
 * Receita recorrente: agrupa as entradas por `merchantKey` e mantém só as que
 * aparecem em ao menos `INCOME_MIN_OCCURRENCES` dos últimos meses. O valor
 * esperado é a média **sobre os meses em que ocorreu**, não sobre a janela toda.
 */
export function detectRecurringIncome(rows: IncomeRow[]): {
  monthlyIncome: number
  sources: { label: string; monthlyAmount: number; occurrences: number }[]
} {
  const byKey = new Map<string, { label: string; byMonth: Map<string, number> }>()

  for (const row of rows) {
    const key = merchantKey(row.name) || row.name.toLowerCase()
    const entry = byKey.get(key) ?? { label: row.name, byMonth: new Map() }
    entry.byMonth.set(row.month, (entry.byMonth.get(row.month) ?? 0) + row.amount)
    byKey.set(key, entry)
  }

  const sources: { label: string; monthlyAmount: number; occurrences: number }[] = []
  for (const entry of byKey.values()) {
    const occurrences = entry.byMonth.size
    if (occurrences < INCOME_MIN_OCCURRENCES) continue
    const total = [...entry.byMonth.values()].reduce((sum, v) => sum + v, 0)
    sources.push({
      label: entry.label,
      monthlyAmount: total / occurrences,
      occurrences,
    })
  }

  sources.sort((a, b) => b.monthlyAmount - a.monthlyAmount)
  return {
    monthlyIncome: sources.reduce((sum, s) => sum + s.monthlyAmount, 0),
    sources,
  }
}

// ── Acesso ao banco ──────────────────────────────────────────────────────────

function walletScope(walletId: string | null) {
  return walletId ? eq(transactions.walletId, walletId) : undefined
}

const MONTH_EXPR = sql<string>`to_char(${transactions.date}::date, 'YYYY-MM')`

export interface LoadedHistory {
  categories: CategorySeries[]
  recurringIncome: ReturnType<typeof detectRecurringIncome>
  /** Quantos meses distintos têm qualquer lançamento — mede a maturidade da base. */
  historyMonths: number
  /** Mediana mensal dos gastos essenciais — default da reserva mínima. */
  medianEssentialMonthly: number
}

export async function loadHistory(
  walletId: string | null,
  from: string,
  to: string,
  monthKeys: string[]
): Promise<LoadedHistory> {
  const period = between(transactions.date, from, to)

  // Gastos variáveis por categoria e mês
  const variableRows = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      month: MONTH_EXPR,
      total: sql<string>`sum(${transactions.amount}::numeric)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        period,
        sql`${transactions.amount}::numeric > 0`,
        eq(transactions.recurrence, "variable"),
        walletScope(walletId)
      )
    )
    .groupBy(transactions.categoryId, categories.name, MONTH_EXPR)

  // Entradas (amount < 0), em magnitude positiva
  const incomeRows = await db
    .select({
      name: transactions.name,
      month: MONTH_EXPR,
      total: sql<string>`abs(sum(${transactions.amount}::numeric))`,
    })
    .from(transactions)
    .where(
      and(period, sql`${transactions.amount}::numeric < 0`, walletScope(walletId))
    )
    .groupBy(transactions.name, MONTH_EXPR)

  // Maturidade da base e mediana de essenciais
  const [meta] = await db
    .select({
      months: sql<number>`count(distinct ${MONTH_EXPR})::int`,
    })
    .from(transactions)
    .where(and(period, walletScope(walletId)))

  const essentialRows = await db
    .select({
      month: MONTH_EXPR,
      total: sql<string>`sum(${transactions.amount}::numeric)`,
    })
    .from(transactions)
    .where(
      and(
        period,
        sql`${transactions.amount}::numeric > 0`,
        eq(transactions.isEssential, true),
        walletScope(walletId)
      )
    )
    .groupBy(MONTH_EXPR)

  const essentialTotals = essentialRows
    .map((r) => Number(r.total))
    .sort((a, b) => a - b)
  const medianEssentialMonthly =
    essentialTotals.length === 0
      ? 0
      : essentialTotals[Math.floor(essentialTotals.length / 2)]

  // Só as entradas dos últimos `INCOME_LOOKBACK_MONTHS` meses da janela contam
  const incomeWindow = new Set(monthKeys.slice(-INCOME_LOOKBACK_MONTHS))

  return {
    categories: buildCategorySeries(
      variableRows.map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName ?? "Sem categoria",
        month: r.month,
        total: Number(r.total),
      })),
      monthKeys
    ),
    recurringIncome: detectRecurringIncome(
      incomeRows
        .filter((r) => incomeWindow.has(r.month))
        .map((r) => ({ name: r.name, month: r.month, amount: Number(r.total) }))
    ),
    historyMonths: Number(meta?.months ?? 0),
    medianEssentialMonthly,
  }
}
