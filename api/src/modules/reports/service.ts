// Orquestra: métricas → insights → narrativa → persistência.
// A narrativa é a única parte que depende de IA; tudo antes dela é
// determinístico e já é um relatório completo.

import { and, desc, eq, sql } from "drizzle-orm"
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

function periodScope(month: number, year: number) {
  return and(eq(monthlyReports.month, month), eq(monthlyReports.year, year))
}

/** Por quanto tempo um relatório gravado vale antes de ser regerado. */
export const REPORT_TTL_MS = 24 * 60 * 60 * 1000

// Gerações em andamento por período. Chamadas simultâneas do mesmo mês
// (StrictMode, duas abas, Home + página) esperam a mesma promessa em vez de
// chamar a IA de novo.
const inFlight = new Map<string, Promise<ReportPayload>>()

function periodKey(month: number, year: number) {
  return `${year}-${month}`
}

/**
 * Gera (ou regenera) o relatório do mês. Regerar **sobrescreve** a linha —
 * o relatório é derivado, não há histórico de versões.
 */
export function generate(input: GenerateInput): Promise<ReportPayload> {
  const key = periodKey(input.month, input.year)
  const pending = inFlight.get(key)
  if (pending) return pending

  const promise = doGenerate(input).finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

async function doGenerate(input: GenerateInput): Promise<ReportPayload> {
  const metrics = await computeMetrics(input.month, input.year)
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
    .where(periodScope(input.month, input.year))
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

type NarrateResult = ReportPayload | null | { message: string }

const narrating = new Map<string, Promise<NarrateResult>>()

/** Só (re)gera a narrativa de um relatório já existente. */
export function narrate(id: string): Promise<NarrateResult> {
  const pending = narrating.get(id)
  if (pending) return pending

  const promise = doNarrate(id).finally(() => narrating.delete(id))
  narrating.set(id, promise)
  return promise
}

async function doNarrate(id: string): Promise<NarrateResult> {
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
export async function list() {
  const rows = await db
    .select({
      id: monthlyReports.id,
      month: monthlyReports.month,
      year: monthlyReports.year,
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
 * O relatório do período vindo do banco enquanto tiver menos de
 * `REPORT_TTL_MS`; depois disso (ou se não existir) gera de novo. É o cache
 * que evita chamar a IA a cada visita ou reload.
 */
export async function forPeriod(
  month: number,
  year: number
): Promise<ReportPayload> {
  // Uma geração em curso vence o banco: a linha ainda pode estar velha
  const pending = inFlight.get(periodKey(month, year))
  if (pending) return pending

  const [row] = await db
    .select()
    .from(monthlyReports)
    .where(periodScope(month, year))
    .limit(1)

  if (row && Date.now() - row.generatedAt.getTime() < REPORT_TTL_MS) {
    const health = await aiAvailable()
    return hydrate(row, health.available)
  }
  return generate({ month, year })
}

/**
 * Atalho do Home: o relatório do mês anterior ao atual, gerado na hora se
 * não existir. É o fallback obrigatório que torna o agendador uma conveniência.
 */
export function current(): Promise<ReportPayload> {
  const now = new Date()
  const prev = previousMonth(now.getFullYear(), now.getMonth() + 1)
  return forPeriod(prev.month, prev.year)
}

export async function remove(id: string) {
  const [deleted] = await db
    .delete(monthlyReports)
    .where(eq(monthlyReports.id, id))
    .returning()
  return !!deleted
}
