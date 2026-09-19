import { describe, expect, test } from "bun:test"
import {
  buildUserPrompt,
  LLM_CONFIDENCE_CEILING,
  sanitizeLlmResponse,
  type LlmClassificationResponse,
} from "./llm"

const allowed = new Set(["cat-a", "cat-b"])
const requested = new Set([0, 1, 2])

function response(
  items: LlmClassificationResponse["items"]
): LlmClassificationResponse {
  return { items }
}

function item(partial: Partial<LlmClassificationResponse["items"][number]>) {
  return {
    index: 0,
    categoryId: "cat-a",
    isEssential: false,
    recurrence: "variable" as const,
    confidence: 1,
    suggestedName: "Netflix",
    ...partial,
  }
}

describe("sanitizeLlmResponse", () => {
  test("categoryId fora da lista vira null", () => {
    const out = sanitizeLlmResponse(
      response([item({ categoryId: "cat-inventada" })]),
      allowed,
      requested
    )
    expect(out[0].categoryId).toBeNull()
    // O resto da sugestão é preservado
    expect(out[0].suggestedName).toBe("Netflix")
  })

  test("índice duplicado é descartado", () => {
    const out = sanitizeLlmResponse(
      response([item({ index: 0 }), item({ index: 0, categoryId: "cat-b" })]),
      allowed,
      requested
    )
    expect(out).toHaveLength(1)
    expect(out[0].categoryId).toBe("cat-a")
  })

  test("índice fora do intervalo é descartado", () => {
    const out = sanitizeLlmResponse(
      response([item({ index: 99 })]),
      allowed,
      requested
    )
    expect(out).toHaveLength(0)
  })

  test("linha faltando na resposta não quebra nada", () => {
    // O modelo local omitiu a linha 1 — comportamento observado na prática
    const out = sanitizeLlmResponse(
      response([item({ index: 0 }), item({ index: 2 })]),
      allowed,
      requested
    )
    expect(out.map((s) => s.index)).toEqual([0, 2])
  })

  test("teto de confiança de 0,9", () => {
    const out = sanitizeLlmResponse(
      response([item({ confidence: 1 })]),
      allowed,
      requested
    )
    expect(out[0].confidence).toBe(LLM_CONFIDENCE_CEILING)
  })

  test("confiança fora de 0–1 é normalizada antes do teto", () => {
    const out = sanitizeLlmResponse(
      response([item({ confidence: 2 as number })]),
      allowed,
      requested
    )
    expect(out[0].confidence).toBeLessThanOrEqual(LLM_CONFIDENCE_CEILING)
  })

  test("nome vazio vira null", () => {
    const out = sanitizeLlmResponse(
      response([item({ suggestedName: "   " })]),
      allowed,
      requested
    )
    expect(out[0].suggestedName).toBeNull()
  })

  test("marca a origem como llm", () => {
    const out = sanitizeLlmResponse(response([item({})]), allowed, requested)
    expect(out[0].source).toBe("llm")
    expect(out[0].ruleId).toBeNull()
  })
})

describe("buildUserPrompt", () => {
  test("lista categorias e descrições numeradas", () => {
    const prompt = buildUserPrompt(
      [{ id: "cat-a", name: "Moradia" }],
      [{ index: 0, text: "conceito imobiliaria" }]
    )
    expect(prompt).toContain("cat-a = Moradia")
    expect(prompt).toContain("0. conceito imobiliaria")
  })
})
