import { describe, expect, test } from "bun:test"
import {
  buildUserPrompt,
  coerceBoolean,
  coerceConfidence,
  coerceRecurrence,
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

// O modelo local de 7B erra um campo de vez em quando. Antes, um único valor
// torto derrubava o lote inteiro de até 40 linhas — o usuário perdia todas as
// sugestões por causa de uma. Estes testes fixam a tolerância por linha.
describe("tolerância a saída imperfeita do modelo", () => {
  test("recurrence em português é aproveitada em vez de derrubar o lote", () => {
    const out = sanitizeLlmResponse(
      response([
        item({ index: 0, recurrence: "fixo" as never }),
        item({ index: 1, recurrence: "variável" as never }),
      ]),
      allowed,
      requested
    )
    expect(out).toHaveLength(2)
    expect(out[0].recurrence).toBe("fixed")
    expect(out[1].recurrence).toBe("variable")
  })

  test("recurrence irreconhecível vira null, mas a linha sobrevive", () => {
    const out = sanitizeLlmResponse(
      response([item({ recurrence: "trimestral" as never })]),
      allowed,
      requested
    )
    expect(out).toHaveLength(1)
    expect(out[0].recurrence).toBeNull()
    // O resto da sugestão continua aproveitável
    expect(out[0].categoryId).toBe("cat-a")
  })

  test("uma linha torta não leva as outras", () => {
    const out = sanitizeLlmResponse(
      response([
        // Sem index utilizável: só esta é descartada
        { categoryId: "cat-a", confidence: 1 } as never,
        item({ index: 1 }),
        item({ index: 2 }),
      ]),
      allowed,
      requested
    )
    expect(out.map((s) => s.index)).toEqual([1, 2])
  })

  test("confiança em percentual é normalizada", () => {
    const out = sanitizeLlmResponse(
      response([item({ confidence: 80 as never })]),
      allowed,
      requested
    )
    // 80 → 0,8 → teto de 0,9 aplicado
    expect(out[0].confidence).toBeCloseTo(0.72, 4)
  })

  test("confiança ausente vira incerteza honesta, não zero nem um", () => {
    const out = sanitizeLlmResponse(
      response([item({ confidence: undefined as never })]),
      allowed,
      requested
    )
    expect(out[0].confidence).toBeCloseTo(0.5 * LLM_CONFIDENCE_CEILING, 4)
  })

  test("isEssential em português é aproveitado", () => {
    const out = sanitizeLlmResponse(
      response([
        item({ index: 0, isEssential: "sim" as never }),
        item({ index: 1, isEssential: "não" as never }),
      ]),
      allowed,
      requested
    )
    expect(out[0].isEssential).toBe(true)
    expect(out[1].isEssential).toBe(false)
  })

  test("nome longo demais é truncado em 60 caracteres", () => {
    const out = sanitizeLlmResponse(
      response([item({ suggestedName: "N".repeat(200) })]),
      allowed,
      requested
    )
    expect(out[0].suggestedName!.length).toBe(60)
  })

  test("items vazio não quebra", () => {
    expect(sanitizeLlmResponse(response([]), allowed, requested)).toEqual([])
  })
})

describe("coerções", () => {
  test("coerceRecurrence cobre as variações observadas", () => {
    for (const value of ["fixed", "fixo", "FIXA", " mensal ", "recorrente"]) {
      expect(coerceRecurrence(value)).toBe("fixed")
    }
    for (const value of ["variable", "variavel", "variável", "pontual"]) {
      expect(coerceRecurrence(value)).toBe("variable")
    }
    for (const value of [null, undefined, 42, "sei lá", ""]) {
      expect(coerceRecurrence(value)).toBeNull()
    }
  })

  test("coerceBoolean cobre as variações observadas", () => {
    expect(coerceBoolean(true)).toBe(true)
    expect(coerceBoolean("sim")).toBe(true)
    expect(coerceBoolean("TRUE")).toBe(true)
    expect(coerceBoolean(false)).toBe(false)
    expect(coerceBoolean("não")).toBe(false)
    expect(coerceBoolean("talvez")).toBeNull()
    expect(coerceBoolean(null)).toBeNull()
  })

  test("coerceConfidence normaliza e limita", () => {
    expect(coerceConfidence(0.8)).toBe(0.8)
    expect(coerceConfidence(80)).toBe(0.8)
    expect(coerceConfidence("0.6")).toBe(0.6)
    expect(coerceConfidence(-1)).toBe(0)
    expect(coerceConfidence(9999)).toBe(1)
    expect(coerceConfidence(undefined)).toBe(0.5)
    expect(coerceConfidence("abc")).toBe(0.5)
  })
})
