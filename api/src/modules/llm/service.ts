import { and, desc, gte, lte, sql } from "drizzle-orm"
import { db } from "../../db"
import { llmCalls } from "../../db/schema"
import { log } from "./log"
import { getLlm, llmEnabled } from "./provider"
import {
  LlmError,
  type LlmJsonRequest,
  type LlmResult,
  type LlmTextRequest,
} from "./types"

/** Feature que originou a chamada — usada na telemetria de `llm_calls`. */
export type LlmFeature =
  | "categorization"
  | "monthly_report"
  | "scenario_parse"

/** Toda chamada grava uma linha, inclusive as que falham. Nunca derruba o fluxo. */
async function record(
  feature: LlmFeature,
  provider: string,
  model: string,
  latencyMs: number,
  success: boolean,
  usage?: { inputTokens: number; outputTokens: number; estimatedCostBrl: number },
  errorMessage?: string
) {
  try {
    await db.insert(llmCalls).values({
      feature,
      provider,
      model,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      estimatedCostBrl: String(usage?.estimatedCostBrl ?? 0),
      latencyMs,
      success,
      errorMessage: errorMessage?.slice(0, 500) ?? null,
    })
  } catch (err) {
    // Telemetria nunca pode quebrar a feature que está medindo
    log.error("falha ao gravar llm_calls", {
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Saída estruturada validada por zod, com telemetria. Lança `LlmError`. */
export async function runJson<T>(
  feature: LlmFeature,
  req: LlmJsonRequest<T>
): Promise<LlmResult<T>> {
  if (!llmEnabled()) {
    throw new LlmError("IA desligada (LLM_ENABLED=false)", "unavailable")
  }
  const llm = await getLlm()
  const startedAt = Date.now()
  try {
    const result = await llm.completeJson(req)
    await record(
      feature,
      result.provider,
      result.model,
      result.latencyMs,
      true,
      result.usage
    )
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await record(
      feature,
      llm.name,
      llm.model,
      Date.now() - startedAt,
      false,
      undefined,
      message
    )
    throw err
  }
}

/** Texto livre (narrativa), com telemetria. Lança `LlmError`. */
export async function runText(
  feature: LlmFeature,
  req: LlmTextRequest
): Promise<LlmResult<string>> {
  if (!llmEnabled()) {
    throw new LlmError("IA desligada (LLM_ENABLED=false)", "unavailable")
  }
  const llm = await getLlm()
  const startedAt = Date.now()
  try {
    const result = await llm.complete(req)
    await record(
      feature,
      result.provider,
      result.model,
      result.latencyMs,
      true,
      result.usage
    )
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await record(
      feature,
      llm.name,
      llm.model,
      Date.now() - startedAt,
      false,
      undefined,
      message
    )
    throw err
  }
}

/**
 * Responde se a IA está disponível agora. Nunca lança — uma falha aqui vira
 * `{ available: false }` e cada rota degrada conforme sua spec.
 */
export async function aiAvailable(): Promise<{
  available: boolean
  provider: string | null
  model: string | null
  detail?: string
}> {
  if (!llmEnabled()) {
    return {
      available: false,
      provider: null,
      model: null,
      detail: "LLM_ENABLED=false",
    }
  }
  try {
    const llm = await getLlm()
    const health = await llm.health()
    return {
      available: health.ok,
      provider: llm.name,
      model: llm.model,
      detail: health.detail,
    }
  } catch (err) {
    return {
      available: false,
      provider: null,
      model: null,
      detail: err instanceof Error ? err.message : "erro ao carregar provedor",
    }
  }
}

/** Consumo agregado por feature no período — comprova o custo em centavos. */
export async function usage(opts: { from?: string; to?: string } = {}) {
  const conditions = []
  if (opts.from) conditions.push(gte(llmCalls.createdAt, new Date(opts.from)))
  if (opts.to) conditions.push(lte(llmCalls.createdAt, new Date(opts.to)))
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const byFeature = await db
    .select({
      feature: llmCalls.feature,
      calls: sql<number>`count(*)::int`,
      failures: sql<number>`count(*) filter (where not success)::int`,
      inputTokens: sql<number>`coalesce(sum(input_tokens), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(output_tokens), 0)::int`,
      estimatedCostBrl: sql<string>`coalesce(sum(estimated_cost_brl), 0)`,
      avgLatencyMs: sql<number>`coalesce(round(avg(latency_ms)), 0)::int`,
    })
    .from(llmCalls)
    .where(where)
    .groupBy(llmCalls.feature)
    .orderBy(desc(sql`count(*)`))

  const totalCostBrl = byFeature.reduce(
    (sum, row) => sum + Number(row.estimatedCostBrl),
    0
  )
  const totalCalls = byFeature.reduce((sum, row) => sum + row.calls, 0)

  return { byFeature, totalCostBrl: totalCostBrl.toFixed(4), totalCalls }
}
