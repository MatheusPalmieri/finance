// Narrativa do relatório. O LLM recebe o JSON com os números já apurados e
// escreve prosa — ele nunca calcula.
//
// Depois do zod vem a validação anti-alucinação: todo valor citado no texto
// precisa existir nas métricas/insights. Melhor sem texto do que com texto
// errado.

import { z } from "zod"
import { runJson } from "../llm"
import type { Insight, MonthlyReportMetrics, NarrativeSuggestion } from "./types"

/** Prosa natural, mas não criativa. */
export const NARRATIVE_TEMPERATURE = 0.4
/** Folga de arredondamento ao conferir um número citado. */
export const NUMBER_TOLERANCE = 0.01

const schema = z.object({
  narrative: z.string().min(40).max(1600),
  suggestions: z
    .array(
      z.object({
        title: z.string().max(80),
        rationale: z.string().max(240),
        estimatedSavingBrl: z.number().nullable(),
        insightKind: z.string().nullable(),
      })
    )
    .min(1)
    .max(3),
})

const SYSTEM = `Você é um consultor financeiro pessoal falando em português do Brasil.

Você recebe um JSON com os números já apurados. Nunca calcule nem invente números: use exclusivamente os valores presentes no JSON. Se um número não está no JSON, não o escreva.

Tom direto e respeitoso, sem moralismo e sem jargão. Máximo 200 palavras na narrativa.

Termine com 1 a 3 sugestões acionáveis, cada uma ligada a um insight recebido.

Responda APENAS o JSON no formato {"narrative":"...","suggestions":[{"title":"...","rationale":"...","estimatedSavingBrl":null,"insightKind":"..."}]}`

// ── Validação anti-alucinação (pura, coberta por narrative.test.ts) ──────────

/** Todos os números presentes numa estrutura, recursivamente. */
export function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    out.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, out)
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, out)
  }
  return out
}

const CURRENCY_RE = /R\$\s?([\d.]+(?:,\d+)?)/g
const PERCENT_RE = /(\d+(?:[.,]\d+)?)\s?%/g

/** Converte "1.234,56" (pt-BR) em 1234.56. */
function parseBrNumber(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."))
}

/** Valores monetários e percentuais citados no texto. */
export function extractQuotedNumbers(text: string): number[] {
  const out: number[] = []
  for (const match of text.matchAll(CURRENCY_RE)) {
    out.push(parseBrNumber(match[1]))
  }
  for (const match of text.matchAll(PERCENT_RE)) {
    out.push(Number(match[1].replace(",", ".")))
  }
  return out.filter((n) => Number.isFinite(n))
}

function matchesAny(value: number, allowed: number[]): boolean {
  return allowed.some((candidate) => {
    const scale = Math.max(Math.abs(candidate), Math.abs(value), 1)
    return Math.abs(Math.abs(candidate) - Math.abs(value)) <= scale * NUMBER_TOLERANCE
  })
}

export interface NarrativeValidation {
  ok: boolean
  /** Números citados que não existem nas métricas. */
  offending: number[]
}

/**
 * Confere cada valor citado contra o conjunto de números das métricas e
 * insights, com tolerância de arredondamento de ±1%.
 */
export function validateNarrative(
  text: string,
  allowed: number[]
): NarrativeValidation {
  const quoted = extractQuotedNumbers(text)
  const offending = quoted.filter((value) => !matchesAny(value, allowed))
  return { ok: offending.length === 0, offending }
}

// ── Chamada ──────────────────────────────────────────────────────────────────

/** Poda das métricas: só o que interessa à narrativa vai ao provedor. */
export function buildNarrativePayload(
  metrics: MonthlyReportMetrics,
  insights: Insight[]
) {
  return {
    periodo: { mes: metrics.period.month, ano: metrics.period.year, parcial: metrics.period.partial },
    totais: metrics.totals,
    distribuicao: metrics.distribution,
    orcamentos: metrics.budgets
      .filter((b) => b.status !== "on_track")
      .map((b) => ({
        nome: b.name,
        planejado: b.plannedBrl ?? b.plannedMaxBrl,
        realizado: b.actualBrl,
        situacao: b.status,
      })),
    anomalias: metrics.anomalies.map((a) => ({
      categoria: a.categoryName,
      atual: a.currentBrl,
      mediana: a.medianBrl,
      severidade: a.severity,
    })),
    maioresAltas: metrics.topMovers.up,
    maioresQuedas: metrics.topMovers.down,
    assinaturas: metrics.subscriptions,
    insights: insights.map((i) => ({
      tipo: i.kind,
      severidade: i.severity,
      titulo: i.title,
      valor: i.amountBrl,
      dados: i.facts,
    })),
  }
}

export interface NarrativeResult {
  narrative: string
  suggestions: NarrativeSuggestion[]
  provider: string
  model: string
}

export class NarrativeRejected extends Error {
  constructor(readonly offending: number[]) {
    super(
      `Narrativa descartada: cita número(s) inexistente(s) nas métricas — ${offending.join(", ")}`
    )
    this.name = "NarrativeRejected"
  }
}

/**
 * Gera a narrativa. Lança `NarrativeRejected` quando a validação
 * anti-alucinação reprova, e `LlmError` quando o provedor falha — o chamador
 * marca o relatório como `NARRATION_FAILED` nos dois casos.
 */
export async function generateNarrative(
  metrics: MonthlyReportMetrics,
  insights: Insight[]
): Promise<NarrativeResult> {
  const payload = buildNarrativePayload(metrics, insights)

  const result = await runJson("monthly_report", {
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    schema,
    temperature: NARRATIVE_TEMPERATURE,
    maxTokens: 1200,
    retries: 1,
  })

  const allowed = collectNumbers({ metrics, insights })
  const validation = validateNarrative(result.data.narrative, allowed)
  if (!validation.ok) {
    console.error(
      `[reports] ${new NarrativeRejected(validation.offending).message}`
    )
    throw new NarrativeRejected(validation.offending)
  }

  return {
    narrative: result.data.narrative,
    suggestions: result.data.suggestions,
    provider: result.provider,
    model: result.model,
  }
}
