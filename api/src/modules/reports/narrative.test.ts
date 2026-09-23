import { describe, expect, test } from "bun:test"
import {
  buildNarrativePayload,
  collectNumbers,
  extractQuotedNumbers,
  narrativeTimeoutMs,
  validateNarrative,
} from "./narrative"
import { buildDistribution, nullableScalar, scalar } from "./metrics"
import type { Insight, MonthlyReportMetrics } from "./types"

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

describe("buildNarrativePayload", () => {
  function metrics(
    partial: Partial<MonthlyReportMetrics> = {}
  ): MonthlyReportMetrics {
    return {
      period: {
        month: 11, year: 2025, from: "2025-11-01", to: "2025-11-30", partial: false,
      },
      totals: {
        totalExpenses: scalar(5000, 4000),
        totalIncome: scalar(8000, 8000),
        netResult: scalar(3000, 4000),
        savingsRate: nullableScalar(37.5, 50),
        transactionCount: scalar(40, 38),
        avgTicket: scalar(125, 105),
        noSpendDays: scalar(10, 12),
      },
      biggestExpense: null,
      budgets: [],
      distribution: buildDistribution({
        essential: 50, desire: 30, investment: 20,
      }),
      anomalies: [],
      topMovers: { up: [], down: [] },
      newMerchants: [],
      subscriptions: null,
      ...partial,
    }
  }

  test("poda os orçamentos que estão no alvo", () => {
    const payload = buildNarrativePayload(
      metrics({
        budgets: [
          { budgetId: "b1", name: "No alvo", type: "essential", amountType: "fixed", plannedBrl: 1000, plannedMinBrl: null, plannedMaxBrl: null, actualBrl: 1000, status: "on_track", transactionCount: 1 },
          { budgetId: "b2", name: "Estourou", type: "essential", amountType: "fixed", plannedBrl: 1000, plannedMinBrl: null, plannedMaxBrl: null, actualBrl: 1500, status: "over", transactionCount: 1 },
        ],
      }),
      []
    )

    expect(payload.orcamentos).toHaveLength(1)
    expect(payload.orcamentos[0].nome).toBe("Estourou")
    expect(payload.orcamentos[0].situacao).toBe("over")
  })

  test("orçamento de faixa usa o teto como planejado", () => {
    const payload = buildNarrativePayload(
      metrics({
        budgets: [
          { budgetId: "b1", name: "Faixa", type: "essential", amountType: "variable", plannedBrl: null, plannedMinBrl: 500, plannedMaxBrl: 800, actualBrl: 900, status: "over", transactionCount: 3 },
        ],
      }),
      []
    )
    expect(payload.orcamentos[0].planejado).toBe(800)
  })

  test("resume as anomalias sem mandar as transações", () => {
    const payload = buildNarrativePayload(
      metrics({
        anomalies: [
          {
            categoryId: "c1", categoryName: "Alimentação", color: "#000",
            currentBrl: 1500, medianBrl: 900, robustZ: 4, severity: "high",
            history: [{ month: "2025-10", amountBrl: 900 }],
            topTransactions: [
              { id: "t1", name: "Mercado caro", amountBrl: 800, date: "2025-11-05" },
            ],
          },
        ],
      }),
      []
    )

    expect(payload.anomalias[0]).toEqual({
      categoria: "Alimentação", atual: 1500, mediana: 900, severidade: "high",
    })
    // O nome da transação não precisa ir ao provedor
    expect(JSON.stringify(payload)).not.toContain("Mercado caro")
  })

  test("os insights viram material citável", () => {
    const insights: Insight[] = [
      {
        kind: "negative_month", severity: "critical",
        title: "Você gastou R$ 320,00 a mais do que recebeu",
        amountBrl: 320, facts: { netResult: -320 },
      },
    ]
    const payload = buildNarrativePayload(metrics(), insights)

    expect(payload.insights[0].tipo).toBe("negative_month")
    expect(payload.insights[0].valor).toBe(320)
    expect(payload.insights[0].dados).toEqual({ netResult: -320 })
  })

  test("todo número do payload existe nas métricas originais", () => {
    const source = metrics()
    const payload = buildNarrativePayload(source, [])
    const allowed = new Set(collectNumbers({ metrics: source, insights: [] }))

    for (const value of collectNumbers(payload)) {
      expect(allowed.has(value)).toBe(true)
    }
  })

  test("o período parcial é sinalizado ao modelo", () => {
    const payload = buildNarrativePayload(
      metrics({
        period: {
          month: 11, year: 2025, from: "2025-11-01", to: "2025-11-30", partial: true,
        },
      }),
      []
    )
    expect(payload.periodo.parcial).toBe(true)
  })
})

describe("narrativeTimeoutMs", () => {
  test("default de 3 minutos — a chamada mais pesada e mais rara do app", () => {
    delete process.env.LLM_NARRATIVE_TIMEOUT_MS
    expect(narrativeTimeoutMs()).toBe(180_000)
  })

  test("configurável por variável de ambiente", () => {
    process.env.LLM_NARRATIVE_TIMEOUT_MS = "300000"
    expect(narrativeTimeoutMs()).toBe(300_000)
    delete process.env.LLM_NARRATIVE_TIMEOUT_MS
  })

  test("valor inválido cai no default em vez de virar NaN", () => {
    process.env.LLM_NARRATIVE_TIMEOUT_MS = "abc"
    expect(narrativeTimeoutMs()).toBe(180_000)
    delete process.env.LLM_NARRATIVE_TIMEOUT_MS
  })
})
