// Orquestra: métricas → insights → narrativa → persistência.
// A narrativa é a única parte que depende de IA; tudo antes dela é
// determinístico e já é um relatório completo.

import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { monthlyReports, type MonthlyReport } from "../../db/schema"
import { aiAvailable } from "../llm"
import { buildInsights } from "./insights"
import { computeMetrics, previousMonth } from "./metrics"
import { generateNarrative } from "./narrative"
import type {
  Insight,
  MonthlyReportMetrics,
  NarrativeSuggestion,
} from "./types"

export interface GenerateInput {
  month: number
  year: number
  walletId?: string | null
  /** Default `true`. */
  narrate?: boolean
}

export interface ReportPayload extends Omit<MonthlyReport, "metrics" | "insights" | "suggestions"> {
  metrics: MonthlyReportMetrics
  insights: Insight[]
  suggestions: NarrativeSuggestion[] | null
  /** `false` quando a IA estava fora — a UI mostra o aviso e o botão de retry. */
  aiAvailable: boolean
}

function hydrate(row: MonthlyReport, ai: boolean): ReportPayload {
  return {
    ...row,
    metrics: row.metrics as MonthlyReportMetrics,
    insights: row.insights as Insight[],
    suggestions: (row.suggestions as NarrativeSuggestion[] | null) ?? null,
    aiAvailable: ai,
  }
}

function periodScope(month: number, year: number, walletId: string | null) {
  return and(
    eq(monthlyReports.month, month),
    eq(monthlyReports.year, year),
    walletId
      ? eq(monthlyReports.walletId, walletId)
      : isNull(monthlyReports.walletId)
  )
}

/**
 * Gera (ou regenera) o relatório do mês. Regerar **sobrescreve** a linha —
 * o relatório é derivado, não há histórico de versões.
 */
export async function generate(input: GenerateInput): Promise<ReportPayload> {
  const walletId = input.walletId ?? null
  const metrics = await computeMetrics(input.month, input.year, walletId)
  const insights = buildInsights(metrics)

  let narrative: string | null = null
  let suggestions: NarrativeSuggestion[] | null = null
  let narrativeProvider: string | null = null
  let narrativeModel: string | null = null
  let status: MonthlyReport["status"] = "GENERATED"
  let ai = false

  if (input.narrate !== false) {
    const health = await aiAvailable()
    ai = health.available
    if (ai) {
      try {
        const result = await generateNarrative(metrics, insights)
        narrative = result.narrative
        suggestions = result.suggestions
        narrativeProvider = result.provider
        narrativeModel = result.model
        status = "NARRATED"
      } catch (err) {
        // Números prontos, IA falhou: o relatório abre completo, só sem texto
        status = "NARRATION_FAILED"
        console.error(
          "[reports] narrativa indisponível:",
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  const values = {
    month: input.month,
    year: input.year,
    walletId,
    status,
    metrics,
    insights,
    narrative,
    suggestions,
    narrativeProvider,
    narrativeModel,
    generatedAt: new Date(),
  }

  const [existing] = await db
    .select({ id: monthlyReports.id })
    .from(monthlyReports)
    .where(periodScope(input.month, input.year, walletId))
    .limit(1)

  const [row] = existing
    ? await db
        .update(monthlyReports)
        .set(values)
        .where(eq(monthlyReports.id, existing.id))
        .returning()
    : await db.insert(monthlyReports).values(values).returning()

  return hydrate(row, ai)
}

/** Só (re)gera a narrativa de um relatório já existente. */
export async function narrate(
  id: string
): Promise<ReportPayload | null | { message: string }> {
  const [row] = await db
    .select()
    .from(monthlyReports)
    .where(eq(monthlyReports.id, id))
    .limit(1)
  if (!row) return null

  const health = await aiAvailable()
  if (!health.available) {
    return { message: health.detail ?? "IA indisponível no momento" }
  }

  const metrics = row.metrics as MonthlyReportMetrics
  const insights = row.insights as Insight[]

  try {
    const result = await generateNarrative(metrics, insights)
    const [updated] = await db
      .update(monthlyReports)
      .set({
        status: "NARRATED",
        narrative: result.narrative,
        suggestions: result.suggestions,
        narrativeProvider: result.provider,
        narrativeModel: result.model,
      })
      .where(eq(monthlyReports.id, id))
      .returning()
    return hydrate(updated, true)
  } catch (err) {
    const [updated] = await db
      .update(monthlyReports)
      .set({ status: "NARRATION_FAILED", narrative: null, suggestions: null })
      .where(eq(monthlyReports.id, id))
      .returning()
    console.error(
      "[reports] narrativa rejeitada:",
      err instanceof Error ? err.message : err
    )
    return hydrate(updated, true)
  }
}

/** Lista resumida, sem carregar o jsonb inteiro na resposta. */
export async function list(walletId?: string | null) {
  const rows = await db
    .select({
      id: monthlyReports.id,
      month: monthlyReports.month,
      year: monthlyReports.year,
      walletId: monthlyReports.walletId,
      status: monthlyReports.status,
      generatedAt: monthlyReports.generatedAt,
      totalExpenses: sql<string>`(${monthlyReports.metrics} #>> '{totals,totalExpenses,current}')`,
      netResult: sql<string>`(${monthlyReports.metrics} #>> '{totals,netResult,current}')`,
      criticalInsights: sql<number>`(
        select count(*)::int from jsonb_array_elements(${monthlyReports.insights}) as i
        where i->>'severity' = 'critical'
      )`,
    })
    .from(monthlyReports)
    .where(
      walletId
        ? eq(monthlyReports.walletId, walletId)
        : isNull(monthlyReports.walletId)
    )
    .orderBy(desc(monthlyReports.year), desc(monthlyReports.month))

  return rows.map((row) => ({
    ...row,
    totalExpenses: Number(row.totalExpenses ?? 0),
    netResult: Number(row.netResult ?? 0),
  }))
}

export async function getById(id: string): Promise<ReportPayload | null> {
  const [row] = await db
    .select()
    .from(monthlyReports)
    .where(eq(monthlyReports.id, id))
    .limit(1)
  if (!row) return null
  const health = await aiAvailable()
  return hydrate(row, health.available)
}

/**
 * Atalho da página: o relatório do mês anterior ao atual, gerado na hora se
 * não existir. É o fallback obrigatório que torna o agendador uma conveniência.
 */
export async function current(
  walletId?: string | null
): Promise<ReportPayload> {
  const now = new Date()
  const prev = previousMonth(now.getFullYear(), now.getMonth() + 1)

  const [row] = await db
    .select()
    .from(monthlyReports)
    .where(periodScope(prev.month, prev.year, walletId ?? null))
    .limit(1)

  if (row) {
    const health = await aiAvailable()
    return hydrate(row, health.available)
  }
  return generate({ month: prev.month, year: prev.year, walletId })
}

export async function remove(id: string) {
  const [deleted] = await db
    .delete(monthlyReports)
    .where(eq(monthlyReports.id, id))
    .returning()
  return !!deleted
}
