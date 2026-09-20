// Camada 3 — o LLM escolhe a categoria de uma lista fechada.
//
// Nunca enviamos ao provedor: valor, saldo, número de conta ou nome do titular.
// Só a descrição já normalizada. Isso limita o que sai da máquina quando o
// provedor é a nuvem, e está escrito aqui porque é uma decisão, não um detalhe.

import { z } from "zod"
import type { Recurrence } from "../../db/schema"
import { runJson } from "../llm"
import { normalizeDescription } from "./normalize"
import { EMPTY_PATCH, type Suggestion } from "./types"

/** Máximo de descrições por chamada. Acima disso o modelo local passa de ~50s. */
export const LLM_BATCH_SIZE = 40

/** Sugestão de IA nunca chega com a confiança de uma regra determinística. */
export const LLM_CONFIDENCE_CEILING = 0.9

/**
 * O schema do lote é deliberadamente frouxo: `items` é uma lista de valores
 * desconhecidos, validados **um a um** em `sanitizeLlmResponse`.
 *
 * Um modelo 7B erra um campo de vez em quando — escreve `"fixo"` em vez de
 * `"fixed"`, ou manda a confiança como `80`. Com um schema estrito, um único
 * campo torto numa linha derruba o lote inteiro de até 40 descrições e o
 * usuário perde todas as sugestões. A tolerância por linha é o mesmo princípio
 * que já vale para a linha ausente: o que não dá para aproveitar é descartado
 * sozinho, sem levar o resto junto.
 */
const responseSchema = z.object({
  items: z.array(z.unknown()),
})

/** Forma de uma linha aproveitável, depois da coerção campo a campo. */
const itemSchema = z.object({
  index: z.number().int(),
  categoryId: z.string().nullish(),
  isEssential: z.unknown().nullish(),
  recurrence: z.unknown().nullish(),
  confidence: z.unknown().nullish(),
  suggestedName: z.string().nullish(),
})

export type LlmClassificationResponse = z.infer<typeof responseSchema>

// ── Coerções tolerantes ──────────────────────────────────────────────────────

const FIXED_WORDS = new Set(["fixed", "fixo", "fixa", "mensal", "recorrente"])
const VARIABLE_WORDS = new Set([
  "variable",
  "variavel",
  "variável",
  "pontual",
  "eventual",
])

/** Aceita as variações em português que o modelo local costuma emitir. */
export function coerceRecurrence(value: unknown): Recurrence | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (FIXED_WORDS.has(normalized)) return "fixed"
  if (VARIABLE_WORDS.has(normalized)) return "variable"
  return null
}

export function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (["true", "sim", "yes"].includes(normalized)) return true
  if (["false", "nao", "não", "no"].includes(normalized)) return false
  return null
}

/** Confiança ausente ou absurda vira 0,5 — incerteza honesta, não zero nem um. */
export function coerceConfidence(value: unknown): number {
  const raw = typeof value === "string" ? Number(value) : value
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0.5
  // O modelo às vezes responde em percentual (80 em vez de 0,8)
  const scaled = raw > 1 && raw <= 100 ? raw / 100 : raw
  return Math.min(1, Math.max(0, scaled))
}

const SYSTEM = `Você é um classificador de descrições de extrato bancário brasileiro.

Regras:
- Escolha a categoria APENAS da lista fornecida, usando o id exato. Nunca invente uma categoria.
- Quando estiver em dúvida, responda categoryId: null. É melhor deixar em branco do que errar.
- "recurrence" é "fixed" para cobranças que se repetem todo mês (assinatura, aluguel, mensalidade) e "variable" para gastos pontuais.
- "isEssential" é true para necessidades (moradia, alimentação básica, saúde, transporte para trabalho) e false para supérfluos.
- "suggestedName" é um nome curto e legível para a transação (ex.: "Netflix", "Aluguel"), no máximo 60 caracteres.
- "confidence" é a sua confiança, um número entre 0 e 1 (0.8, não 80).
- Responda uma entrada para CADA índice recebido.

Use EXATAMENTE estes valores, em inglês: "recurrence" é "fixed" ou "variable" (nunca "fixo", "mensal" ou "variável"); "isEssential" é true ou false (nunca "sim" ou "não").

Exemplo. Descrições recebidas:
0. condominio edificio central
1. supermercado angeloni

Resposta:
{"items":[{"index":0,"categoryId":"<id de Moradia>","isEssential":true,"recurrence":"fixed","confidence":0.9,"suggestedName":"Condomínio"},{"index":1,"categoryId":"<id de Alimentação>","isEssential":true,"recurrence":"variable","confidence":0.8,"suggestedName":"Supermercado"}]}

Responda APENAS o JSON no formato {"items":[...]}`

export interface LlmCategory {
  id: string
  name: string
}

export function buildUserPrompt(
  categories: LlmCategory[],
  descriptions: { index: number; text: string }[]
): string {
  const categoryList = categories
    .map((c) => `- ${c.id} = ${c.name}`)
    .join("\n")
  const descriptionList = descriptions
    .map((d) => `${d.index}. ${d.text}`)
    .join("\n")
  return `Categorias disponíveis:\n${categoryList}\n\nDescrições a classificar:\n${descriptionList}`
}

/**
 * Pós-validação obrigatória — o zod não basta:
 * - categoryId fora da lista enviada vira null;
 * - índice fora do intervalo ou repetido é descartado;
 * - linha ausente na resposta simplesmente não recebe sugestão;
 * - confiança do modelo é multiplicada pelo teto de 0,9.
 *
 * Função pura, coberta por llm.test.ts.
 */
export function sanitizeLlmResponse(
  response: LlmClassificationResponse,
  allowedCategoryIds: Set<string>,
  requestedIndexes: Set<number>
): Suggestion[] {
  const seen = new Set<number>()
  const out: Suggestion[] = []

  for (const raw of response.items) {
    // Linha sem `index` utilizável é descartada sozinha, sem levar o lote
    const parsed = itemSchema.safeParse(raw)
    if (!parsed.success) continue
    const item = parsed.data

    if (!requestedIndexes.has(item.index)) continue
    if (seen.has(item.index)) continue
    seen.add(item.index)

    const categoryId =
      item.categoryId && allowedCategoryIds.has(item.categoryId)
        ? item.categoryId
        : null

    out.push({
      ...EMPTY_PATCH,
      index: item.index,
      source: "llm",
      ruleId: null,
      confidence: Number(
        (coerceConfidence(item.confidence) * LLM_CONFIDENCE_CEILING).toFixed(4)
      ),
      categoryId,
      isEssential: coerceBoolean(item.isEssential),
      recurrence: coerceRecurrence(item.recurrence),
      // Nome absurdamente longo é sinal de alucinação — melhor não usar
      suggestedName: item.suggestedName?.trim().slice(0, 60) || null,
    })
  }

  return out
}

export interface LlmClassifyResult {
  suggestions: Suggestion[]
  latencyMs: number
}

/**
 * Classifica um lote de descrições. Quebra em lotes de `LLM_BATCH_SIZE` e
 * tolera lote que falhe: as linhas daquele lote ficam sem sugestão.
 */
export async function classifyWithLlm(
  categories: LlmCategory[],
  items: { index: number; description: string }[]
): Promise<LlmClassifyResult> {
  if (items.length === 0 || categories.length === 0) {
    return { suggestions: [], latencyMs: 0 }
  }

  const allowed = new Set(categories.map((c) => c.id))
  const suggestions: Suggestion[] = []
  let latencyMs = 0

  for (let i = 0; i < items.length; i += LLM_BATCH_SIZE) {
    const batch = items.slice(i, i + LLM_BATCH_SIZE)
    const requested = new Set(batch.map((b) => b.index))
    const prompt = buildUserPrompt(
      categories,
      batch.map((b) => ({
        index: b.index,
        // Só a descrição normalizada sai daqui — nunca valor, data ou conta
        text: normalizeDescription(b.description),
      }))
    )

    const result = await runJson("categorization", {
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      schema: responseSchema,
      temperature: 0,
      retries: 1,
    })

    latencyMs += result.latencyMs
    suggestions.push(...sanitizeLlmResponse(result.data, allowed, requested))
  }

  return { suggestions, latencyMs }
}
