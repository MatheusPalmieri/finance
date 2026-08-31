import { describe, expect, it } from "bun:test"
import { normalizeDate, normalizeTransaction, planSync } from "./normalize"
import type { ProviderTransaction } from "./types"

function tx(over: Partial<ProviderTransaction>): ProviderTransaction {
  return {
    providerTransactionId: "tx-1",
    description: "Compra",
    amount: -10,
    currencyCode: "BRL",
    date: "2026-08-01",
    status: "POSTED",
    category: "Outros",
    raw: { id: "tx-1" },
    ...over,
  }
}

describe("normalizeDate", () => {
  it("mantém YYYY-MM-DD", () => {
    expect(normalizeDate("2026-08-01")).toBe("2026-08-01")
  })
  it("reduz datetime ISO para o dia", () => {
    expect(normalizeDate("2026-08-01T13:45:00.000Z")).toBe("2026-08-01")
  })
  it("lança em data inválida", () => {
    expect(() => normalizeDate("nao-e-data")).toThrow()
  })
})

describe("normalizeTransaction", () => {
  it("inverte o sinal: saída do provedor vira despesa positiva", () => {
    const n = normalizeTransaction(tx({ amount: -256.9 }))
    expect(n.amount).toBe("256.90")
    expect(n.direction).toBe("OUTFLOW")
  })

  it("entrada do provedor vira valor negativo", () => {
    const n = normalizeTransaction(tx({ amount: 1500 }))
    expect(n.amount).toBe("-1500.00")
    expect(n.direction).toBe("INFLOW")
  })

  it("preserva status, categoria e identificador externo", () => {
    const n = normalizeTransaction(
      tx({ providerTransactionId: "abc", status: "PENDING", category: "Mercado" })
    )
    expect(n.providerTransactionId).toBe("abc")
    expect(n.status).toBe("PENDING")
    expect(n.category).toBe("Mercado")
  })

  it("usa fallback quando a descrição vem vazia", () => {
    expect(normalizeTransaction(tx({ description: "   " })).description).toBe(
      "Sem descrição"
    )
  })

  it("lança quando o valor não é numérico", () => {
    expect(() =>
      normalizeTransaction(tx({ amount: Number.NaN }))
    ).toThrow()
  })
})

describe("planSync", () => {
  it("separa novos de existentes pelo id do provedor", () => {
    const incoming = [tx({ providerTransactionId: "a" }), tx({ providerTransactionId: "b" })]
    const plan = planSync(incoming, new Set(["a"]))
    expect(plan.toInsert.map((n) => n.providerTransactionId)).toEqual(["b"])
    expect(plan.toUpdate.map((n) => n.providerTransactionId)).toEqual(["a"])
  })

  it("colapsa duplicatas dentro do lote (última vence)", () => {
    const incoming = [
      tx({ providerTransactionId: "a", amount: -10 }),
      tx({ providerTransactionId: "a", amount: -20 }),
    ]
    const plan = planSync(incoming, new Set())
    expect(plan.toInsert).toHaveLength(1)
    expect(plan.toInsert[0]!.amount).toBe("20.00")
  })

  it("é idempotente: reimportar o mesmo lote não gera inserts", () => {
    const incoming = [tx({ providerTransactionId: "a" }), tx({ providerTransactionId: "b" })]
    const first = planSync(incoming, new Set())
    const known = new Set(first.toInsert.map((n) => n.providerTransactionId))
    const second = planSync(incoming, known)
    expect(second.toInsert).toHaveLength(0)
    expect(second.toUpdate).toHaveLength(2)
  })
})
