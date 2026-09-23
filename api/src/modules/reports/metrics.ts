// Seções 1–6 do relatório. Todo número sai daqui (SQL + TypeScript puro) e é
// persistido ANTES de o LLM ser chamado. Se a narrativa citar um número que não
// está neste objeto, é bug.
//
// Convenção de sinal do projeto: amount > 0 é despesa, amount < 0 é entrada.

import { and, between, desc, eq, sql } from "drizzle-orm"
import { db } from "../../db"
import {
  budgets,
  categories,
  recurringSeries,
  transactions,
  type BudgetType,
} from "../../db/schema"
import { merchantKey } from "../classification/normalize"
import { monthlyCost, priceChangePct } from "../classification/recurring"
import { COUNTED_TRANSACTIONS } from "../../lib/scope"
import { MIN_HISTORY_POINTS, robustZ } from "../../lib/stats"
import type {
  Anomaly,
  AnomalySeverity,
  BudgetLine,
  BudgetLineStatus,
  Distribution,
  MonthlyReportMetrics,
  Mover,
  NewMerchant,
  NullableScalar,
  Scalar,
  SubscriptionsSection,
} from "./types"

/** Quantos meses de histórico as anomalias olham para trás. */
export const ANOMALY_HISTORY_MONTHS = 6
/** Metas da regra 50/30/20. */
export const DISTRIBUTION_TARGETS: Record<BudgetType, number> = {
  essential: 50,
  desire: 30,
  investment: 20,
}
/** Gasto mínimo para um estabelecimento novo virar notícia. */
export const NEW_MERCHANT_MIN_BRL = 50

// ── Helpers puros ─────────────────────────────────────────────────────────────

export function monthRange(year: number, month: number) {
  const pad = String(month).padStart(2, "0")
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    from: `${year}-${pad}-01`,
    to: `${year}-${pad}-${String(lastDay).padStart(2, "0")}`,
    days: lastDay,
  }
}

/** Desloca um par (ano, mês) por um número de meses, para frente ou para trás. */
export function shiftMonth(year: number, month: number, delta: number) {
  const zeroBased = year * 12 + (month - 1) + delta
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  }
}

export function previousMonth(year: number, month: number) {
  return shiftMonth(year, month, -1)
}

/** Variação percentual; `null` quando o mês anterior é zero. */
export function scalar(current: number, previous: number): Scalar {
  return {
    current: round2(current),
    previous: round2(previous),
    deltaPct:
      previous === 0
        ? null
        : round2(((current - previous) / Math.abs(previous)) * 100),
  }
}

export function nullableScalar(
  current: number | null,
  previous: number | null
): NullableScalar {
  return {
    current: current === null ? null : round2(current),
    previous: previous === null ? null : round2(previous),
    deltaPct:
      current === null || previous === null || previous === 0
        ? null
        : round2(((current - previous) / Math.abs(previous)) * 100),
  }
}

export function round2(value: number): number {
  return Number(value.toFixed(2))
}

/** Dias do mês sem nenhuma despesa. */
export function countNoSpendDays(
  daysInMonth: number,
  datesWithExpense: string[]
): number {
  return daysInMonth - new Set(datesWithExpense).size
}

/**
 * Orçamento `fixed` tolera ±2% antes de virar over/under; `variable` usa a
 * própria faixa como tolerância.
 */
export function classifyBudgetStatus(
  budget: {
    amountType: "fixed" | "variable"
    amount: string | null
    amountMin: string | null
    amountMax: string | null
  },
  actual: number,
  transactionCount: number
): BudgetLineStatus {
  // Sem nenhum lançamento no mês: é assim que o relatório pega "esqueceu de
  // lançar a conta de luz".
  if (transactionCount === 0) return "missing"

  if (budget.amountType === "fixed") {
    const planned = Number(budget.amount ?? 0)
    if (actual > planned * 1.02) return "over"
    if (actual < planned * 0.98) return "under"
    return "on_track"
  }

  const min = Number(budget.amountMin ?? 0)
  const max = Number(budget.amountMax ?? 0)
  if (actual > max) return "over"
  if (actual < min) return "under"
  return "on_track"
}

/**
 * Classificação 50/30/20 de uma despesa. Gasto variável não tem `budgetId`,
 * então precisa de outro critério — esta é a regra, e ela é determinística:
 *
 * - `fixed` herda o `type` do orçamento vinculado;
 * - `variable` + essencial → essential;
 * - `variable` + não essencial → desire;
 * - `investment` só vem de orçamento vinculado.
 */
export function classifySpend(row: {
  recurrence: "fixed" | "variable"
  isEssential: boolean
  budgetType: BudgetType | null
}): BudgetType {
  if (row.recurrence === "fixed" && row.budgetType) return row.budgetType
  return row.isEssential ? "essential" : "desire"
}

export function buildDistribution(
  byType: Record<BudgetType, number>
): Distribution {
  const total = byType.essential + byType.desire + byType.investment
  const bucket = (type: BudgetType) => {
    const amountBrl = round2(byType[type])
    const pct = total === 0 ? 0 : round2((amountBrl / total) * 100)
    return {
      amountBrl,
      pct,
      targetPct: DISTRIBUTION_TARGETS[type],
      deltaPp: round2(pct - DISTRIBUTION_TARGETS[type]),
    }
  }
  return {
    essential: bucket("essential"),
    desire: bucket("desire"),
    investment: bucket("investment"),
  }
}

/** Fora destas faixas, a variação não entra no relatório. */
export function classifyAnomaly(z: number): AnomalySeverity | null {
  if (z >= 3.5) return "high"
  if (z >= 2.0) return "medium"
  if (z <= -2.0) return "saving"
  return null
}

// ── Consultas ────────────────────────────────────────────────────────────────

const IS_EXPENSE = sql`${transactions.amount}::numeric > 0`
const IS_INCOME = sql`${transactions.amount}::numeric < 0`

interface PeriodTotals {
  expenses: number
  income: number
  transactionCount: number
  expenseDates: string[]
}

async function periodTotals(
  from: string,
  to: string
): Promise<PeriodTotals> {
  const [row] = await db
    .select({
      expenses: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${IS_EXPENSE}), 0)`,
      income: sql<string>`coalesce(abs(sum(${transactions.amount}::numeric) filter (where ${IS_INCOME})), 0)`,
      transactionCount: sql<number>`count(*) filter (where ${IS_EXPENSE})::int`,
    })
    .from(transactions)
    .where(and(between(transactions.date, from, to), COUNTED_TRANSACTIONS))

  const dates = await db
    .selectDistinct({ date: transactions.date })
    .from(transactions)
    .where(
      and(between(transactions.date, from, to), IS_EXPENSE, COUNTED_TRANSACTIONS)
    )

  return {
    expenses: Number(row?.expenses ?? 0),
    income: Number(row?.income ?? 0),
    transactionCount: Number(row?.transactionCount ?? 0),
    expenseDates: dates.map((d) => d.date),
  }
}

async function expensesByCategory(
  from: string,
  to: string
) {
  return db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      color: categories.color,
      total: sql<string>`sum(${transactions.amount}::numeric)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(between(transactions.date, from, to), IS_EXPENSE, COUNTED_TRANSACTIONS)
    )
    .groupBy(transactions.categoryId, categories.name, categories.color)
}

/** Série mensal por categoria nos N meses anteriores ao mês do relatório. */
async function categoryHistory(
  historyFrom: string,
  historyTo: string
) {
  return db
    .select({
      categoryId: transactions.categoryId,
      month: sql<string>`to_char(${transactions.date}::date, 'YYYY-MM')`,
      total: sql<string>`sum(${transactions.amount}::numeric)`,
    })
    .from(transactions)
    .where(
      and(
        between(transactions.date, historyFrom, historyTo),
        IS_EXPENSE,
        COUNTED_TRANSACTIONS
      )
    )
    .groupBy(transactions.categoryId, sql`to_char(${transactions.date}::date, 'YYYY-MM')`)
}

// ── Motor ────────────────────────────────────────────────────────────────────

export async function computeMetrics(
  month: number,
  year: number
): Promise<MonthlyReportMetrics> {
  const range = monthRange(year, month)
  const prev = previousMonth(year, month)
  const prevRange = monthRange(prev.year, prev.month)

  const today = new Date().toISOString().slice(0, 10)
  const partial = today <= range.to

  const [current, previous] = await Promise.all([
    periodTotals(range.from, range.to),
    periodTotals(prevRange.from, prevRange.to),
  ])

  const netCurrent = current.income - current.expenses
  const netPrevious = previous.income - previous.expenses

  const totals = {
    totalExpenses: scalar(current.expenses, previous.expenses),
    totalIncome: scalar(current.income, previous.income),
    netResult: scalar(netCurrent, netPrevious),
    savingsRate: nullableScalar(
      current.income === 0 ? null : (netCurrent / current.income) * 100,
      previous.income === 0 ? null : (netPrevious / previous.income) * 100
    ),
    transactionCount: scalar(current.transactionCount, previous.transactionCount),
    avgTicket: scalar(
      current.transactionCount === 0
        ? 0
        : current.expenses / current.transactionCount,
      previous.transactionCount === 0
        ? 0
        : previous.expenses / previous.transactionCount
    ),
    noSpendDays: scalar(
      countNoSpendDays(range.days, current.expenseDates),
      countNoSpendDays(prevRange.days, previous.expenseDates)
    ),
  }

  // ── Maior despesa isolada ──────────────────────────────────────────────────
  const [biggest] = await db
    .select({
      id: transactions.id,
      name: transactions.name,
      amount: transactions.amount,
      date: transactions.date,
      categoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(between(transactions.date, range.from, range.to), IS_EXPENSE, COUNTED_TRANSACTIONS)
    )
    .orderBy(desc(sql`${transactions.amount}::numeric`))
    .limit(1)

  // ── Planejado vs. realizado ────────────────────────────────────────────────
  const budgetRows = await db.select().from(budgets)
  const budgetActuals = await db
    .select({
      budgetId: transactions.budgetId,
      total: sql<string>`sum(${transactions.amount}::numeric)`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(
      and(
        between(transactions.date, range.from, range.to),
        IS_EXPENSE,
        COUNTED_TRANSACTIONS
      )
    )
    .groupBy(transactions.budgetId)

  const actualByBudget = new Map(
    budgetActuals
      .filter((r) => r.budgetId)
      .map((r) => [r.budgetId!, { total: Number(r.total), count: r.count }])
  )

  const budgetLines: BudgetLine[] = budgetRows.map((budget) => {
    const actual = actualByBudget.get(budget.id) ?? { total: 0, count: 0 }
    return {
      budgetId: budget.id,
      name: budget.name,
      type: budget.type,
      amountType: budget.amountType,
      plannedBrl: budget.amount === null ? null : Number(budget.amount),
      plannedMinBrl: budget.amountMin === null ? null : Number(budget.amountMin),
      plannedMaxBrl: budget.amountMax === null ? null : Number(budget.amountMax),
      actualBrl: round2(actual.total),
      status: classifyBudgetStatus(budget, actual.total, actual.count),
      transactionCount: actual.count,
    }
  })

  // ── Distribuição 50/30/20 ──────────────────────────────────────────────────
  const spendRows = await db
    .select({
      recurrence: transactions.recurrence,
      isEssential: transactions.isEssential,
      budgetType: budgets.type,
      total: sql<string>`sum(${transactions.amount}::numeric)`,
    })
    .from(transactions)
    .leftJoin(budgets, eq(transactions.budgetId, budgets.id))
    .where(
      and(between(transactions.date, range.from, range.to), IS_EXPENSE, COUNTED_TRANSACTIONS)
    )
    .groupBy(transactions.recurrence, transactions.isEssential, budgets.type)

  const byType: Record<BudgetType, number> = {
    essential: 0,
    desire: 0,
    investment: 0,
  }
  for (const row of spendRows) {
    byType[classifySpend(row)] += Number(row.total)
  }
  const distribution = buildDistribution(byType)

  // ── Anomalias e top movers ─────────────────────────────────────────────────
  const currentByCategory = await expensesByCategory(range.from, range.to)
  const previousByCategory = await expensesByCategory(
    prevRange.from,
    prevRange.to
  )

  // Janela de histórico: os 6 meses ANTERIORES ao do relatório (o mês corrente
  // fica de fora de propósito — ele é o valor testado contra a série).
  const historyStartMonth = shiftMonth(
    prev.year,
    prev.month,
    -(ANOMALY_HISTORY_MONTHS - 1)
  )
  const historyStart = monthRange(
    historyStartMonth.year,
    historyStartMonth.month
  )
  const history = await categoryHistory(
    historyStart.from,
    prevRange.to
  )

  const historyByCategory = new Map<string, { month: string; amount: number }[]>()
  for (const row of history) {
    const bucket = historyByCategory.get(row.categoryId) ?? []
    bucket.push({ month: row.month, amount: Number(row.total) })
    historyByCategory.set(row.categoryId, bucket)
  }

  const anomalies: Anomaly[] = []
  for (const row of currentByCategory) {
    const series = (historyByCategory.get(row.categoryId) ?? []).sort((a, b) =>
      a.month.localeCompare(b.month)
    )
    if (series.length < MIN_HISTORY_POINTS) continue

    const currentTotal = Number(row.total)
    const z = robustZ(
      currentTotal,
      series.map((s) => s.amount)
    )
    if (!z) continue

    const severity = classifyAnomaly(z.z)
    if (!severity) continue

    const topTransactions = await db
      .select({
        id: transactions.id,
        name: transactions.name,
        amount: transactions.amount,
        date: transactions.date,
      })
      .from(transactions)
      .where(
        and(
          between(transactions.date, range.from, range.to),
          eq(transactions.categoryId, row.categoryId),
          IS_EXPENSE,
          COUNTED_TRANSACTIONS
        )
      )
      .orderBy(desc(sql`${transactions.amount}::numeric`))
      .limit(3)

    anomalies.push({
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? "Sem categoria",
      color: row.color ?? "#6b7280",
      currentBrl: round2(currentTotal),
      medianBrl: round2(z.median),
      robustZ: round2(z.z),
      severity,
      history: series.map((s) => ({
        month: s.month,
        amountBrl: round2(s.amount),
      })),
      topTransactions: topTransactions.map((t) => ({
        id: t.id,
        name: t.name,
        amountBrl: round2(Number(t.amount)),
        date: t.date,
      })),
    })
  }
  anomalies.sort((a, b) => Math.abs(b.robustZ) - Math.abs(a.robustZ))

  const previousByCategoryMap = new Map(
    previousByCategory.map((r) => [r.categoryId, Number(r.total)])
  )
  const movers: Mover[] = currentByCategory.map((row) => {
    const previousBrl = previousByCategoryMap.get(row.categoryId) ?? 0
    const currentBrl = Number(row.total)
    return {
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? "Sem categoria",
      color: row.color ?? "#6b7280",
      currentBrl: round2(currentBrl),
      previousBrl: round2(previousBrl),
      deltaBrl: round2(currentBrl - previousBrl),
    }
  })
  // Categorias que sumiram também são movimento: entram com current 0
  for (const [categoryId, previousBrl] of previousByCategoryMap) {
    if (movers.some((m) => m.categoryId === categoryId)) continue
    const source = previousByCategory.find((r) => r.categoryId === categoryId)!
    movers.push({
      categoryId,
      categoryName: source.categoryName ?? "Sem categoria",
      color: source.color ?? "#6b7280",
      currentBrl: 0,
      previousBrl: round2(previousBrl),
      deltaBrl: round2(-previousBrl),
    })
  }

  const topMovers = {
    up: [...movers].sort((a, b) => b.deltaBrl - a.deltaBrl).filter((m) => m.deltaBrl > 0).slice(0, 5),
    down: [...movers].sort((a, b) => a.deltaBrl - b.deltaBrl).filter((m) => m.deltaBrl < 0).slice(0, 5),
  }

  // ── Estabelecimentos novos ─────────────────────────────────────────────────
  const currentNames = await db
    .select({
      name: transactions.name,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(
      and(between(transactions.date, range.from, range.to), IS_EXPENSE, COUNTED_TRANSACTIONS)
    )

  const historyNames = await db
    .select({ name: transactions.name })
    .from(transactions)
    .where(
      and(
        between(transactions.date, historyStart.from, prevRange.to),
        IS_EXPENSE,
        COUNTED_TRANSACTIONS
      )
    )
  const seenKeys = new Set(historyNames.map((r) => merchantKey(r.name)))

  const newByKey = new Map<string, NewMerchant>()
  for (const row of currentNames) {
    const key = merchantKey(row.name)
    if (!key || seenKeys.has(key)) continue
    const existing = newByKey.get(key)
    if (existing) {
      existing.totalBrl = round2(existing.totalBrl + Number(row.amount))
      existing.transactionCount++
    } else {
      newByKey.set(key, {
        merchantKey: key,
        label: row.name,
        totalBrl: round2(Number(row.amount)),
        transactionCount: 1,
      })
    }
  }
  const newMerchants = [...newByKey.values()]
    .filter((m) => m.totalBrl >= NEW_MERCHANT_MIN_BRL)
    .sort((a, b) => b.totalBrl - a.totalBrl)
    .slice(0, 5)

  // ── Assinaturas (só quando a spec 01 já produziu séries) ───────────────────
  const subscriptions = await buildSubscriptions(range.from, range.to)

  return {
    period: {
      month,
      year,
      from: range.from,
      to: range.to,
      partial,
    },
    totals,
    biggestExpense: biggest
      ? {
          id: biggest.id,
          name: biggest.name,
          amountBrl: round2(Number(biggest.amount)),
          date: biggest.date,
          categoryName: biggest.categoryName,
        }
      : null,
    budgets: budgetLines,
    distribution,
    anomalies,
    topMovers,
    newMerchants,
    subscriptions,
  }
}

async function buildSubscriptions(
  from: string,
  to: string
): Promise<SubscriptionsSection | null> {
  const rows = await db
    .select()
    .from(recurringSeries)
    .where(eq(recurringSeries.dismissed, false))

  if (rows.length === 0) return null

  const enriched = rows.map((row) => {
    const change = priceChangePct(Number(row.firstAmount), Number(row.lastAmount))
    return {
      id: row.id,
      label: row.label,
      status: row.status,
      detectedAt: row.detectedAt.toISOString().slice(0, 10),
      monthlyCostBrl: round2(
        monthlyCost(Number(row.averageAmount), row.intervalDays)
      ),
      priceChangePct: change === null ? null : round2(change * 100),
    }
  })

  const active = enriched.filter((s) => s.status === "ACTIVE")

  return {
    totalMonthlyBrl: round2(
      active.reduce((sum, s) => sum + s.monthlyCostBrl, 0)
    ),
    activeCount: active.length,
    newThisMonth: enriched
      .filter((s) => s.detectedAt >= from && s.detectedAt <= to)
      .map(({ id, label, monthlyCostBrl }) => ({ id, label, monthlyCostBrl })),
    priceIncreases: enriched
      .filter((s) => s.priceChangePct !== null)
      .map(({ id, label, monthlyCostBrl, priceChangePct: pct }) => ({
        id,
        label,
        monthlyCostBrl,
        priceChangePct: pct!,
      })),
    inactive: enriched
      .filter((s) => s.status !== "ACTIVE")
      .map(({ id, label, status }) => ({ id, label, status })),
  }
}
