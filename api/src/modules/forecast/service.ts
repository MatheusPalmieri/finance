// Monta os insumos da projeção e orquestra o Monte Carlo.
// É o único arquivo do módulo, junto de `history.ts`, que toca o banco.

import { and, between, eq, gt, ne, sql } from "drizzle-orm"
import { db } from "../../db"
import {
  accounts,
  appSettings,
  budgets,
  transactions,
  type AppSettings,
} from "../../db/schema"
import { COUNTED_TRANSACTIONS } from "../../lib/scope"
import { getLiveBalances } from "../open-finance/balances"
import { getLiveInvestments } from "../open-finance/investments"
import { HISTORY_MONTHS, loadHistory } from "./history"
import { horizonMonths, monthKey, SIMULATION_RUNS, simulate } from "./montecarlo"
import { deriveSeed } from "./random"
import { applyScenario } from "./scenario"
import {
  classifyVerdict,
  computeActions,
  type SimulateFn,
} from "./verdict"
import type {
  AffordabilityActions,
  AffordabilityVerdict,
  CashflowProjection,
  MonthPlan,
  OpeningBalanceSource,
  RangeBudget,
  ScenarioEvent,
} from "./types"

export const DEFAULT_HORIZON_MONTHS = 6
export const MAX_HORIZON_MONTHS = 12

function round2(value: number): number {
  return Number(value.toFixed(2))
}

/** YYYY-MM-DD de hoje. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthRange(year: number, month: number) {
  const pad = String(month).padStart(2, "0")
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    from: `${year}-${pad}-01`,
    to: `${year}-${pad}-${String(lastDay).padStart(2, "0")}`,
    days: lastDay,
  }
}

// ── Preferências ─────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1))
  if (row) return row
  const [created] = await db
    .insert(appSettings)
    .values({ id: 1, defaultHorizonMonths: DEFAULT_HORIZON_MONTHS })
    .returning()
  return created
}

export async function updateSettings(input: {
  minimumReserveBrl?: number | null
  defaultHorizonMonths?: number
}): Promise<AppSettings> {
  await getSettings() // garante a linha singleton
  const [updated] = await db
    .update(appSettings)
    .set({
      minimumReserveBrl:
        input.minimumReserveBrl === undefined
          ? undefined
          : input.minimumReserveBrl === null
            ? null
            : String(input.minimumReserveBrl),
      defaultHorizonMonths: input.defaultHorizonMonths,
    })
    .where(eq(appSettings.id, 1))
    .returning()
  return updated
}

// ── Insumos ──────────────────────────────────────────────────────────────────

interface ForecastInputs {
  openingBalance: number
  openingAccounts: { id: string; name: string; balance: number }[]
  openingBalanceSource: OpeningBalanceSource
  months: MonthPlan[]
  horizon: { month: number; year: number; label: string; key: string }[]
  categories: Awaited<ReturnType<typeof loadHistory>>["categories"]
  recurringIncome: Awaited<ReturnType<typeof loadHistory>>["recurringIncome"]
  historyMonths: number
  minimumReserveBrl: number
  minimumReserveIsDefault: boolean
  seed: number
}

/**
 * Saldo inicial.
 *
 * Contas ligadas ao Open Finance usam o saldo **ao vivo** (spec 04: saldo nunca
 * é persistido). O cartão entra negativo com a **fatura em aberto**: o usado
 * do limite menos as parcelas futuras, que já estão em `knownTransactions` do
 * mês em que caem — sem esse desconto elas seriam contadas duas vezes, e sem a
 * fatura a projeção ignoraria compras já feitas e ainda não pagas.
 *
 * Renda fixa com liquidez diária entra como caixa (ver abaixo).
 *
 * Contas sem vínculo usam o `balance` cadastrado. Com a Pluggy fora do ar, as
 * ligadas também caem no cadastrado e `openingBalanceSource` vira "stored".
 */
async function loadOpeningBalance() {
  const live = await getLiveBalances()
  const liveIds = new Set(live.available ? live.accounts.map((a) => a.accountId) : [])

  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      balance: accounts.balance,
    })
    .from(accounts)
    // Cartão tem saldo com semântica de fatura; sandbox é dado de teste
    .where(and(ne(accounts.type, "CREDIT_CARD"), eq(accounts.isSandbox, false)))

  const openingAccounts: { id: string; name: string; balance: number }[] = rows
    .filter((r) => !liveIds.has(r.id))
    .map((r) => ({ id: r.id, name: r.name, balance: Number(r.balance) }))

  if (live.available) {
    for (const account of live.accounts.filter((a) => a.type === "BANK")) {
      openingAccounts.push({ id: account.accountId, name: account.accountName, balance: account.balance })
    }
    for (const card of live.accounts.filter((a) => a.type === "CREDIT")) {
      const [future] = await db
        .select({ total: sql<string>`coalesce(sum(${transactions.amount}::numeric), 0)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.accountId, card.accountId),
            gt(transactions.date, today()),
            COUNTED_TRANSACTIONS
          )
        )
      const openBill = Math.max(0, card.balance - Number(future?.total ?? 0))
      openingAccounts.push({
        id: card.accountId,
        name: `${card.accountName} (fatura em aberto)`,
        balance: round2(-openBill),
      })
    }
  }

  // Renda fixa com liquidez diária (caixinhas/RDB) é caixa: aplicação e resgate
  // são movimentos internos, então conta + RDB formam um só dinheiro disponível
  const investments = await getLiveInvestments()
  if (investments.available && investments.liquid > 0) {
    openingAccounts.push({
      id: "investments-liquid",
      name: "Investimentos com liquidez diária",
      balance: investments.liquid,
    })
  }

  return {
    openingAccounts,
    openingBalance: round2(
      openingAccounts.reduce((sum, a) => sum + a.balance, 0)
    ),
    openingBalanceSource: (live.available ? "live" : "stored") as OpeningBalanceSource,
  }
}

async function buildInputs(
  requestedHorizon: number | undefined
): Promise<ForecastInputs> {
  const settings = await getSettings()
  const horizonCount = Math.min(
    MAX_HORIZON_MONTHS,
    Math.max(1, requestedHorizon ?? settings.defaultHorizonMonths)
  )

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const horizon = horizonMonths(currentMonth, currentYear, horizonCount)

  // Janela histórica: os 12 meses que terminam no mês anterior ao corrente
  const historyKeys: string[] = []
  for (let i = HISTORY_MONTHS; i >= 1; i--) {
    const zeroBased = currentYear * 12 + (currentMonth - 1) - i
    historyKeys.push(
      monthKey((zeroBased % 12) + 1, Math.floor(zeroBased / 12))
    )
  }
  const historyStart = monthRange(
    Number(historyKeys[0].slice(0, 4)),
    Number(historyKeys[0].slice(5))
  )
  const historyEnd = monthRange(
    Number(historyKeys[historyKeys.length - 1].slice(0, 4)),
    Number(historyKeys[historyKeys.length - 1].slice(5))
  )

  const [{ openingBalance, openingAccounts, openingBalanceSource }, history, budgetRows] =
    await Promise.all([
      loadOpeningBalance(),
      loadHistory(historyStart.from, historyEnd.to, historyKeys),
      db.select().from(budgets),
    ])

  // Orçamentos: fixos entram determinísticos, faixas viram triangulares
  let fixedTotal = 0
  const rangeBudgets: RangeBudget[] = []
  for (const budget of budgetRows) {
    if (budget.amountType === "fixed") {
      fixedTotal += Number(budget.amount ?? 0)
    } else {
      const min = Number(budget.amountMin ?? 0)
      const max = Number(budget.amountMax ?? 0)
      if (max <= 0) continue
      rangeBudgets.push({
        budgetId: budget.id,
        name: budget.name,
        min,
        mode: (min + max) / 2,
        max,
      })
    }
  }

  // Transações já cadastradas com data futura (positivo = saída líquida)
  const futureRows = await db
    .select({
      month: sql<string>`to_char(${transactions.date}::date, 'YYYY-MM')`,
      total: sql<string>`sum(${transactions.amount}::numeric)`,
    })
    .from(transactions)
    .where(and(gt(transactions.date, today()), COUNTED_TRANSACTIONS))
    .groupBy(sql`to_char(${transactions.date}::date, 'YYYY-MM')`)
  const futureByMonth = new Map(
    futureRows.map((r) => [r.month, Number(r.total)])
  )

  // O mês corrente já tem parte do gasto no saldo das contas. Para não contar
  // duas vezes, descontamos o realizado dos fixos/receita e escalamos os
  // componentes estocásticos pela fração do mês que ainda falta.
  const currentRange = monthRange(currentYear, currentMonth)
  const [realized] = await db
    .select({
      expenses: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.amount}::numeric > 0), 0)`,
      income: sql<string>`coalesce(abs(sum(${transactions.amount}::numeric) filter (where ${transactions.amount}::numeric < 0)), 0)`,
    })
    .from(transactions)
    .where(
      and(
        between(transactions.date, currentRange.from, today()),
        COUNTED_TRANSACTIONS
      )
    )
  const realizedIncome = Number(realized?.income ?? 0)

  const elapsedDays = now.getDate()
  const remainingFraction = Math.max(
    0,
    (currentRange.days - elapsedDays) / currentRange.days
  )

  const months: MonthPlan[] = horizon.map((slot, index) => {
    const isCurrent = index === 0
    return {
      month: slot.month,
      year: slot.year,
      label: slot.label,
      // Receita já recebida no mês corrente não é esperada de novo
      expectedIncome: isCurrent
        ? round2(
            Math.max(0, history.recurringIncome.monthlyIncome - realizedIncome)
          )
        : round2(history.recurringIncome.monthlyIncome),
      // Fixos do mês corrente entram pro-rata pelo que falta do mês
      fixedExpenses: round2(fixedTotal * (isCurrent ? remainingFraction : 1)),
      rangeBudgets,
      knownTransactions: round2(futureByMonth.get(slot.key) ?? 0),
      scenarioImpact: 0,
      remainingFraction: isCurrent ? remainingFraction : 1,
    }
  })

  const minimumReserveIsDefault = settings.minimumReserveBrl === null
  const minimumReserveBrl = minimumReserveIsDefault
    ? round2(history.medianEssentialMonthly)
    : Number(settings.minimumReserveBrl)

  return {
    openingBalance,
    openingAccounts,
    openingBalanceSource,
    months,
    horizon,
    categories: history.categories,
    recurringIncome: history.recurringIncome,
    historyMonths: history.historyMonths,
    minimumReserveBrl,
    minimumReserveIsDefault,
    seed: deriveSeed(currentMonth, currentYear),
  }
}

function project(
  inputs: ForecastInputs,
  months: MonthPlan[]
): CashflowProjection {
  const result = simulate({
    openingBalance: inputs.openingBalance,
    months,
    categories: inputs.categories,
    runs: SIMULATION_RUNS,
    seed: inputs.seed,
  })

  return {
    openingBalance: inputs.openingBalance,
    openingAccounts: inputs.openingAccounts,
    openingBalanceSource: inputs.openingBalanceSource,
    months: result.months,
    summary: result.summary,
    assumptions: {
      historyMonths: inputs.historyMonths,
      lowConfidenceCategories: inputs.categories
        .filter((c) => c.lowConfidence)
        .map((c) => c.categoryName),
      categoriesWithTrend: inputs.categories
        .filter((c) => c.trendMonthlyPct !== null)
        .map((c) => ({
          categoryName: c.categoryName,
          monthlyPct: Number(((c.trendMonthlyPct ?? 0) * 100).toFixed(1)),
        })),
      simulationRuns: SIMULATION_RUNS,
      seed: inputs.seed,
      minimumReserveBrl: inputs.minimumReserveBrl,
      minimumReserveIsDefault: inputs.minimumReserveIsDefault,
      recurringIncome: {
        monthlyTotal: round2(inputs.recurringIncome.monthlyIncome),
        sources: inputs.recurringIncome.sources.map((s) => ({
          label: s.label,
          monthlyAmount: round2(s.monthlyAmount),
          occurrences: s.occurrences,
        })),
      },
    },
  }
}

// ── API pública do módulo ────────────────────────────────────────────────────

export async function cashflow(
  horizon?: number
): Promise<CashflowProjection> {
  const inputs = await buildInputs(horizon)
  return project(inputs, inputs.months)
}

export interface SimulateResult {
  base: CashflowProjection
  withScenario: CashflowProjection
  verdict: AffordabilityVerdict
}

export async function simulateScenario(
  events: ScenarioEvent[],
  horizon?: number
): Promise<SimulateResult> {
  const inputs = await buildInputs(horizon)
  const base = project(inputs, inputs.months)
  const withScenario = project(inputs, applyScenario(inputs.months, events))

  return {
    base,
    withScenario,
    verdict: classifyVerdict(
      withScenario.summary,
      inputs.minimumReserveBrl,
      withScenario.months.some((m) => m.balance.p50 < 0)
    ),
  }
}

export interface AffordInput {
  totalAmount: number
  installments?: number
  monthlyInterestPct?: number
  label?: string
  categoryId?: string | null
  horizonMonths?: number
}

export interface AffordResult {
  verdict: AffordabilityVerdict
  actions: AffordabilityActions
  base: CashflowProjection
  withScenario: CashflowProjection
  event: ScenarioEvent
}

/**
 * Atalho de `simulate` com um único evento, resposta focada no veredito e nos
 * acionáveis. Reaproveita os mesmos insumos em todas as simulações da busca
 * binária — o banco é lido uma vez só.
 */
export async function afford(input: AffordInput): Promise<AffordResult> {
  const inputs = await buildInputs(input.horizonMonths)

  const event: Extract<ScenarioEvent, { kind: "installment_purchase" }> = {
    kind: "installment_purchase",
    label: input.label?.trim() || "Compra",
    totalAmount: input.totalAmount,
    installments: Math.max(1, Math.trunc(input.installments ?? 1)),
    monthlyInterestPct: Math.max(0, input.monthlyInterestPct ?? 0),
    categoryId: input.categoryId ?? null,
  }

  const runSimulation: SimulateFn = (events) => {
    const projection = project(inputs, applyScenario(inputs.months, events))
    return {
      summary: projection.summary,
      p50Negative: projection.months.some((m) => m.balance.p50 < 0),
    }
  }

  const base = project(inputs, inputs.months)
  const withScenario = project(inputs, applyScenario(inputs.months, [event]))

  const verdict = classifyVerdict(
    withScenario.summary,
    inputs.minimumReserveBrl,
    withScenario.months.some((m) => m.balance.p50 < 0)
  )

  const actions = computeActions({
    simulate: runSimulation,
    baseEvent: event,
    horizon: inputs.horizon,
    minimumReserveBrl: inputs.minimumReserveBrl,
  })

  return { verdict, actions, base, withScenario, event }
}
