// Camada 3 — o LLM escolhe a categoria de uma lista fechada.
//
// Nunca enviamos ao provedor: valor, saldo, número de conta ou nome do titular.
// Só a descrição já normalizada. Isso limita o que sai da máquina quando o
// provedor é a nuvem, e está escrito aqui porque é uma decisão, não um detalhe.

import { z } from "zod"
import { runJson } from "../llm"
import { normalizeDescription } from "./normalize"
import { EMPTY_PATCH, type Suggestion } from "./types"

/** Máximo de descrições por chamada. Acima disso o modelo local passa de ~50s. */
export const LLM_BATCH_SIZE = 40

/** Sugestão de IA nunca chega com a confiança de uma regra determinística. */
export const LLM_CONFIDENCE_CEILING = 0.9

const responseSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      categoryId: z.string().nullable(),
      isEssential: z.boolean().nullable(),
      recurrence: z.enum(["fixed", "variable"]).nullable(),
      confidence: z.number().min(0).max(1),
      /** Nome curto e legível para substituir a descrição crua do extrato. */
      suggestedName: z.string().max(60).nullable(),
    })
  ),
})

export type LlmClassificationResponse = z.infer<typeof responseSchema>

const SYSTEM = `Você é um classificador de descrições de extrato bancário brasileiro.

Regras:
- Escolha a categoria APENAS da lista fornecida, usando o id exato. Nunca invente uma categoria.
- Quando estiver em dúvida, responda categoryId: null. É melhor deixar em branco do que errar.
- "recurrence" é "fixed" para cobranças que se repetem todo mês (assinatura, aluguel, mensalidade) e "variable" para gastos pontuais.
- "isEssential" é true para necessidades (moradia, alimentação básica, saúde, transporte para trabalho) e false para supérfluos.
- "suggestedName" é um nome curto e legível para a transação (ex.: "Netflix", "Aluguel"), no máximo 60 caracteres.
- "confidence" é a sua confiança de 0 a 1.
- Responda uma entrada para CADA índice recebido.
- Responda APENAS o JSON no formato {"items":[{"index":0,"categoryId":"...","isEssential":true,"recurrence":"fixed","confidence":0.8,"suggestedName":"..."}]}`

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

  for (const item of response.items) {
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
        (Math.min(1, Math.max(0, item.confidence)) * LLM_CONFIDENCE_CEILING).toFixed(4)
      ),
      categoryId,
      isEssential: item.isEssential,
      recurrence: item.recurrence,
      suggestedName: item.suggestedName?.trim() || null,
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
