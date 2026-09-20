import { afterEach, describe, expect, test } from "bun:test"
import { __setLlm } from "../llm/provider"
import { MockLlmProvider } from "../llm/providers/mock"
import { buildParsePrompt, parseScenario, sanitizeEvents } from "./parse"

const CATEGORIES = [
  { id: "cat-a", name: "Eletrônicos" },
  { id: "cat-b", name: "Lazer" },
]
const ALLOWED = new Set(CATEGORIES.map((c) => c.id))
const CONTEXT = { today: "2026-09-19", categories: CATEGORIES }

afterEach(() => __setLlm(null))

function useMock(...responses: (string | Error)[]) {
  const mock = new MockLlmProvider().push(...responses)
  __setLlm(mock)
  return mock
}

describe("sanitizeEvents", () => {
  test("categoryId fora da lista vira null", () => {
    const [event] = sanitizeEvents(
      [
        {
          kind: "installment_purchase",
          label: "Notebook",
          totalAmount: 4000,
          installments: 10,
          categoryId: "cat-inventada",
        },
      ],
      ALLOWED
    )
    expect(event.kind).toBe("installment_purchase")
    expect((event as { categoryId: string | null }).categoryId).toBeNull()
  })

  test("categoryId válido é preservado", () => {
    const [event] = sanitizeEvents(
      [
        {
          kind: "installment_purchase",
          label: "Notebook",
          totalAmount: 4000,
          installments: 10,
          categoryId: "cat-a",
        },
      ],
      ALLOWED
    )
    expect((event as { categoryId: string | null }).categoryId).toBe("cat-a")
  })

  test("mês em formato inválido é descartado e cai no default", () => {
    const [event] = sanitizeEvents(
      [
        {
          kind: "installment_purchase",
          label: "Notebook",
          totalAmount: 4000,
          installments: 1,
          startMonth: "novembro",
        },
      ],
      ALLOWED
    )
    expect((event as { startMonth?: string }).startMonth).toBeUndefined()
  })

  test("one_off sem mês válido é descartado por inteiro", () => {
    expect(
      sanitizeEvents(
        [{ kind: "one_off", label: "IPVA", amount: 1800, month: "qualquer" }],
        ALLOWED
      )
    ).toHaveLength(0)
  })

  test("parcelas fora de 1–360 derrubam o evento", () => {
    expect(
      sanitizeEvents(
        [
          {
            kind: "installment_purchase",
            label: "x",
            totalAmount: 100,
            installments: 0,
          },
        ],
        ALLOWED
      )
    ).toHaveLength(0)
    expect(
      sanitizeEvents(
        [
          {
            kind: "installment_purchase",
            label: "x",
            totalAmount: 100,
            installments: 999,
          },
        ],
        ALLOWED
      )
    ).toHaveLength(0)
  })

  test("valor zero ou negativo derruba a compra", () => {
    expect(
      sanitizeEvents(
        [
          {
            kind: "installment_purchase",
            label: "x",
            totalAmount: 0,
            installments: 1,
          },
        ],
        ALLOWED
      )
    ).toHaveLength(0)
  })

  test("juros negativo é normalizado para zero", () => {
    const [event] = sanitizeEvents(
      [
        {
          kind: "installment_purchase",
          label: "x",
          totalAmount: 100,
          installments: 2,
          monthlyInterestPct: -5,
        },
      ],
      ALLOWED
    )
    expect((event as { monthlyInterestPct?: number }).monthlyInterestPct).toBe(0)
  })

  test("corte de gasto recorrente é preservado como negativo", () => {
    const [event] = sanitizeEvents(
      [
        {
          kind: "recurring_change",
          label: "Cortar streaming",
          monthlyAmount: -55,
        },
      ],
      ALLOWED
    )
    expect((event as { monthlyAmount: number }).monthlyAmount).toBe(-55)
  })

  test("one_off com mês válido é preservado", () => {
    const [event] = sanitizeEvents(
      [{ kind: "one_off", label: "IPVA", amount: 1800, month: "2027-01" }],
      ALLOWED
    )
    expect(event.kind).toBe("one_off")
    expect((event as { amount: number }).amount).toBe(1800)
    expect((event as { month: string }).month).toBe("2027-01")
  })

  test("one_off de valor zero é descartado", () => {
    expect(
      sanitizeEvents(
        [{ kind: "one_off", label: "x", amount: 0, month: "2027-01" }],
        ALLOWED
      )
    ).toHaveLength(0)
  })

  test("income_change é preservado com o mês de início", () => {
    const [event] = sanitizeEvents(
      [
        {
          kind: "income_change",
          label: "Aumento",
          monthlyAmount: 800,
          startMonth: "2026-12",
        },
      ],
      ALLOWED
    )
    expect(event.kind).toBe("income_change")
    expect((event as { monthlyAmount: number }).monthlyAmount).toBe(800)
    expect((event as { startMonth?: string }).startMonth).toBe("2026-12")
  })

  test("income_change de delta zero é descartado", () => {
    expect(
      sanitizeEvents(
        [{ kind: "income_change", label: "x", monthlyAmount: 0 }],
        ALLOWED
      )
    ).toHaveLength(0)
  })

  test("recurring_change de valor zero é descartado", () => {
    expect(
      sanitizeEvents(
        [{ kind: "recurring_change", label: "x", monthlyAmount: 0 }],
        ALLOWED
      )
    ).toHaveLength(0)
  })

  test("endMonth inválido é descartado sem derrubar o evento", () => {
    const [event] = sanitizeEvents(
      [
        {
          kind: "recurring_change",
          label: "Curso",
          monthlyAmount: 300,
          endMonth: "dezembro",
        },
      ],
      ALLOWED
    )
    expect((event as { endMonth?: string }).endMonth).toBeUndefined()
  })

  test("vários eventos numa frase só são todos sanitizados", () => {
    const events = sanitizeEvents(
      [
        {
          kind: "installment_purchase",
          label: "Notebook",
          totalAmount: 4000,
          installments: 10,
        },
        { kind: "recurring_change", label: "Cortar streaming", monthlyAmount: -55 },
        { kind: "one_off", label: "IPVA", amount: 1800, month: "2027-01" },
        { kind: "income_change", label: "Aumento", monthlyAmount: 800 },
      ],
      ALLOWED
    )
    expect(events.map((e) => e.kind)).toEqual([
      "installment_purchase",
      "recurring_change",
      "one_off",
      "income_change",
    ])
  })

  test("label vazio ganha um default legível", () => {
    const [event] = sanitizeEvents(
      [
        {
          kind: "installment_purchase",
          label: "   ",
          totalAmount: 100,
          installments: 1,
        },
      ],
      ALLOWED
    )
    expect(event.label).toBe("Compra")
  })
})

describe("buildParsePrompt", () => {
  test("inclui a data de hoje, as categorias e a frase", () => {
    const prompt = buildParsePrompt("comprar um notebook", CONTEXT)
    expect(prompt).toContain("2026-09-19")
    expect(prompt).toContain("cat-a = Eletrônicos")
    expect(prompt).toContain("comprar um notebook")
  })

  test("sem categorias instrui a usar null", () => {
    const prompt = buildParsePrompt("x", { today: "2026-09-19", categories: [] })
    expect(prompt).toContain("null")
  })
})

describe("parseScenario", () => {
  test("traduz a frase em evento", async () => {
    useMock(
      JSON.stringify({
        events: [
          {
            kind: "installment_purchase",
            label: "Notebook",
            totalAmount: 4000,
            installments: 10,
            monthlyInterestPct: 0,
            categoryId: "cat-a",
          },
        ],
        interpretation: "Compra de notebook de R$ 4.000 em 10x sem juros.",
      })
    )

    const result = await parseScenario(
      "um notebook de 4 mil em 10x sem juros",
      CONTEXT
    )
    expect(result.aiAvailable).toBe(true)
    expect(result.events).toHaveLength(1)
    expect(result.interpretation).toContain("notebook")
  })

  test("frase sem valor devolve array vazio", async () => {
    useMock(
      JSON.stringify({
        events: [],
        interpretation: "A frase não menciona um valor.",
      })
    )
    const result = await parseScenario("será que dá pra comprar?", CONTEXT)
    expect(result.events).toEqual([])
    expect(result.aiAvailable).toBe(true)
  })

  test("falha do LLM devolve aiAvailable: false, não lança", async () => {
    useMock(new Error("ollama fora"), new Error("ollama fora de novo"))
    const result = await parseScenario("um notebook de 4 mil", CONTEXT)
    expect(result.aiAvailable).toBe(false)
    expect(result.events).toEqual([])
  })

  test("resposta fora do schema não derruba a rota", async () => {
    useMock("desculpe, não consigo", "ainda não consigo")
    const result = await parseScenario("um notebook", CONTEXT)
    expect(result.aiAvailable).toBe(false)
    expect(result.events).toEqual([])
  })

  test("categoria inventada pelo modelo é neutralizada", async () => {
    useMock(
      JSON.stringify({
        events: [
          {
            kind: "installment_purchase",
            label: "Notebook",
            totalAmount: 4000,
            installments: 1,
            categoryId: "cat-que-nao-existe",
          },
        ],
        interpretation: "ok",
      })
    )
    const result = await parseScenario("notebook de 4 mil", CONTEXT)
    expect(
      (result.events[0] as { categoryId: string | null }).categoryId
    ).toBeNull()
  })
})
