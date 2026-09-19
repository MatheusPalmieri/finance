import { describe, expect, test } from "bun:test"
import {
  collectNumbers,
  extractQuotedNumbers,
  validateNarrative,
} from "./narrative"

describe("collectNumbers", () => {
  test("varre objetos e arrays aninhados", () => {
    const numbers = collectNumbers({
      totals: { totalExpenses: { current: 5000, previous: 4000 } },
      insights: [{ amountBrl: 320, facts: { deltaPct: 25 } }],
    })
    expect(numbers.sort((a, b) => a - b)).toEqual([25, 320, 4000, 5000])
  })

  test("ignora strings e nulos", () => {
    expect(collectNumbers({ a: "1000", b: null, c: 7 })).toEqual([7])
  })
})

describe("extractQuotedNumbers", () => {
  test("lê valores em reais no formato pt-BR", () => {
    expect(extractQuotedNumbers("Você gastou R$ 1.234,56 no mês")).toEqual([
      1234.56,
    ])
  })

  test("lê percentuais", () => {
    expect(extractQuotedNumbers("Alimentação subiu 48% em novembro")).toEqual([
      48,
    ])
  })

  test("lê percentual com decimal", () => {
    expect(extractQuotedNumbers("subiu 12,5%")).toEqual([12.5])
  })

  test("texto sem número não devolve nada", () => {
    expect(extractQuotedNumbers("Seu mês foi tranquilo.")).toEqual([])
  })
})

describe("validateNarrative", () => {
  const allowed = [5000, 320, 48, 50, 30, 20]

  test("narrativa coerente é aceita", () => {
    const result = validateNarrative(
      "Você gastou R$ 5.000,00 e fechou R$ 320,00 no vermelho. Essenciais ficaram em 50%.",
      allowed
    )
    expect(result.ok).toBe(true)
  })

  test("número inventado é rejeitado", () => {
    const result = validateNarrative(
      "Você economizou R$ 1.870,00 em assinaturas.",
      allowed
    )
    expect(result.ok).toBe(false)
    expect(result.offending).toEqual([1870])
  })

  test("arredondamento de até 1% passa", () => {
    // 4.980 está a 0,4% de 5.000 — é o arredondamento que o modelo faz
    expect(validateNarrative("Gasto de R$ 4.980,00", allowed).ok).toBe(true)
  })

  test("arredondamento acima de 1% é rejeitado", () => {
    expect(validateNarrative("Gasto de R$ 5.400,00", allowed).ok).toBe(false)
  })

  test("valor citado como negativo casa com o positivo das métricas", () => {
    // O motor guarda 320; a narrativa pode escrever "R$ 320 negativos"
    expect(validateNarrative("Fechou R$ 320,00 negativos", allowed).ok).toBe(
      true
    )
  })

  test("narrativa sem número nenhum é válida", () => {
    expect(validateNarrative("Seu mês foi equilibrado.", allowed).ok).toBe(true)
  })

  test("aponta todos os números ofensores", () => {
    const result = validateNarrative(
      "Gastou R$ 9.999,00 e subiu 77%.",
      allowed
    )
    expect(result.offending).toEqual([9999, 77])
  })
})
