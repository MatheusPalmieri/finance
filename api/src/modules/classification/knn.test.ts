import { describe, expect, test } from "bun:test"
import { buildKnnIndex, KNN_THRESHOLD, knnSuggest } from "./knn"

const CAT_STREAMING = "cat-streaming"
const CAT_FOOD = "cat-food"

function entry(name: string, categoryId: string) {
  return {
    name,
    categoryId,
    paymentMethod: "credit_card" as const,
    recurrence: "fixed" as const,
    isEssential: false,
  }
}

describe("knnSuggest", () => {
  test("vizinho idêntico dá confiança 1", () => {
    const index = buildKnnIndex([entry("Netflix", CAT_STREAMING)])
    const result = knnSuggest(index, "Netflix")
    expect(result?.confidence).toBe(1)
    expect(result?.patch.categoryId).toBe(CAT_STREAMING)
  })

  test("reaproveita o nome quando a chave é a mesma", () => {
    const index = buildKnnIndex([entry("Netflix", CAT_STREAMING)])
    expect(knnSuggest(index, "NETFLIX 12/24")?.patch.suggestedName).toBe(
      "Netflix"
    )
  })

  test("não reaproveita o nome de uma chave diferente", () => {
    const index = buildKnnIndex([entry("Netflix", CAT_STREAMING)])
    const result = knnSuggest(index, "Netflixx")
    // Pode ou não passar do limiar, mas o nome nunca é copiado de outra chave
    expect(result?.patch.suggestedName ?? null).toBeNull()
  })

  test("base vazia devolve null", () => {
    expect(knnSuggest(buildKnnIndex([]), "Netflix")).toBeNull()
  })

  test("abaixo do limiar devolve null", () => {
    const index = buildKnnIndex([entry("Padaria do Zé", CAT_FOOD)])
    const result = knnSuggest(index, "Netflix")
    expect(result).toBeNull()
  })

  test("a maioria ponderada vence", () => {
    const index = buildKnnIndex([
      entry("Uber trip", CAT_FOOD),
      entry("Uber trip", CAT_STREAMING),
      entry("Uber trip", CAT_STREAMING),
    ])
    const result = knnSuggest(index, "UBER *TRIP 8821")
    expect(result?.patch.categoryId).toBe(CAT_STREAMING)
    expect(result?.confidence).toBeGreaterThanOrEqual(KNN_THRESHOLD)
  })

  test("herda forma de pagamento e recorrência dos vizinhos vencedores", () => {
    const index = buildKnnIndex([
      { ...entry("Spotify", CAT_STREAMING), paymentMethod: "pix" },
    ])
    const result = knnSuggest(index, "Spotify")
    expect(result?.patch.paymentMethod).toBe("pix")
    expect(result?.patch.recurrence).toBe("fixed")
    expect(result?.patch.isEssential).toBe(false)
  })

  test("descrição sem chave utilizável devolve null", () => {
    const index = buildKnnIndex([entry("Netflix", CAT_STREAMING)])
    expect(knnSuggest(index, "123456")).toBeNull()
  })
})
