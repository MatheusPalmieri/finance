import { describe, expect, test } from "bun:test"
import {
  detectKind,
  displayName,
  normalizeTransaction,
  paymentMethodHint,
  pluggyCategoryToLocalName,
  toDomainAmount,
  toLocalDate,
} from "./normalize"
import type { ProviderTransaction } from "./types"

function tx(partial: Partial<ProviderTransaction>): ProviderTransaction {
  return { id: "t1", date: "2026-08-10T15:00:00.000Z", amount: -10, type: "DEBIT", ...partial }
}

describe("toLocalDate", () => {
  test("converte UTC para o dia de São Paulo", () => {
    // Pix às 21h46 de 23/08 em Brasília chega como 00:46Z do dia 24
    expect(toLocalDate("2026-08-24T00:46:16.442Z")).toBe("2026-08-23")
    expect(toLocalDate("2026-08-24T12:00:00.000Z")).toBe("2026-08-24")
  })

  test("meia-noite de Brasília (03:00Z, parcelas do cartão) fica no mesmo dia", () => {
    expect(toLocalDate("2027-07-20T03:00:00.000Z")).toBe("2027-07-20")
  })
})

describe("toDomainAmount", () => {
  test("DEBIT é despesa (positivo) na conta e no cartão", () => {
    expect(toDomainAmount({ amount: -52, type: "DEBIT" })).toBe(52) // conta
    expect(toDomainAmount({ amount: 78.75, type: "DEBIT" })).toBe(78.75) // cartão
  })

  test("CREDIT é entrada (negativo) na conta e no cartão", () => {
    expect(toDomainAmount({ amount: 5000, type: "CREDIT" })).toBe(-5000) // conta
    expect(toDomainAmount({ amount: -126.5, type: "CREDIT" })).toBe(-126.5) // estorno no cartão
  })

  test("sem type, usa o sinal da conta", () => {
    expect(toDomainAmount({ amount: -20, type: null })).toBe(20)
  })
})

describe("detectKind", () => {
  test("fatura nos dois lados", () => {
    expect(detectKind(tx({ description: "Pagamento de fatura", categoryId: "05000000" }))).toBe("bill_payment")
    expect(detectKind(tx({ description: "Pagamento recebido", categoryId: "05100000", type: "CREDIT" }))).toBe("bill_payment")
  })

  test("RDB e compra/venda de ativos são investimento", () => {
    expect(detectKind(tx({ description: "Aplicação RDB", categoryId: "03000000" }))).toBe("investment")
    expect(detectKind(tx({ description: "Resgate RDB", type: "CREDIT" }))).toBe("investment")
    expect(detectKind(tx({ description: "Compra de FII|MXRF11" }))).toBe("investment")
    expect(detectKind(tx({ description: "Venda de criptomoedas" }))).toBe("investment")
  })

  test("transferência para conta própria", () => {
    expect(detectKind(tx({ description: "Transferência enviada|Matheus", categoryId: "04000000" }))).toBe("own_transfer")
  })

  test("salário da empresa e proventos continuam regulares", () => {
    expect(
      detectKind(tx({ description: "Transferência Recebida|EMPRESA LTDA", categoryId: "05000000", type: "CREDIT" }))
    ).toBe("regular")
    expect(
      detectKind(tx({ description: "Valor recebido de Investimentos", categoryId: "05090000", type: "CREDIT" }))
    ).toBe("regular")
  })
})

describe("displayName", () => {
  test("Pix enviado vira o nome que o importador de CSV gravava", () => {
    expect(displayName(tx({ description: "Transferência enviada|Raquel Persuhn" }))).toBe("Pix para Raquel Persuhn")
  })

  test("o resto vira 'Tipo - Contraparte', formato do extrato", () => {
    expect(displayName(tx({ description: "Transferência Recebida|EMPRESA LTDA" }))).toBe(
      "Transferência Recebida - EMPRESA LTDA"
    )
    expect(displayName(tx({ description: "Compra de FII|MXRF11" }))).toBe("Compra de FII - MXRF11")
  })

  test("sem '|' mantém o texto", () => {
    expect(displayName(tx({ description: "Academiablufit 3/12" }))).toBe("Academiablufit 3/12")
    expect(displayName(tx({ description: null, descriptionRaw: null }))).toBe("Sem descrição")
  })
})

describe("paymentMethodHint", () => {
  test("cartão é sempre crédito", () => {
    expect(paymentMethodHint(tx({ paymentData: { paymentMethod: "PIX" } }), "CREDIT")).toBe("credit_card")
  })

  test("conta usa paymentData e depois o texto", () => {
    expect(paymentMethodHint(tx({ paymentData: { paymentMethod: "BOLETO" } }), "BANK")).toBe("boleto")
    expect(paymentMethodHint(tx({ paymentData: { paymentMethod: "TED" } }), "BANK")).toBe("transfer")
    expect(paymentMethodHint(tx({ description: "Compra no débito - PISTA 4" }), "BANK")).toBe("debit_card")
    expect(paymentMethodHint(tx({ description: "Aplicação RDB" }), "BANK")).toBe("transfer")
    expect(paymentMethodHint(tx({ description: "Algo", paymentData: { paymentMethod: "OTHER" } }), "BANK")).toBe("pix")
  })
})

describe("pluggyCategoryToLocalName", () => {
  test("prefixo mais longo vence", () => {
    expect(pluggyCategoryToLocalName("09030000")).toBe("Música")
    expect(pluggyCategoryToLocalName("09020000")).toBe("Assinaturas")
    expect(pluggyCategoryToLocalName("07030001")).toBe("Saúde")
    expect(pluggyCategoryToLocalName("07000000")).toBe("Serviços")
  })

  test("comida, transporte e sem mapeamento", () => {
    expect(pluggyCategoryToLocalName("11020000")).toBe("Alimentação")
    expect(pluggyCategoryToLocalName("19050001")).toBe("Transporte")
    expect(pluggyCategoryToLocalName("05000000")).toBeNull()
    expect(pluggyCategoryToLocalName(null)).toBeNull()
  })
})

describe("normalizeTransaction", () => {
  test("parcela futura do cartão", () => {
    const n = normalizeTransaction(
      tx({
        id: "p12",
        date: "2027-07-20T03:00:00.000Z",
        description: "Academiablufit 12/12",
        amount: 78.75,
        type: "DEBIT",
        status: "PENDING",
        categoryId: "07030000",
      }),
      "CREDIT"
    )
    expect(n).toEqual({
      externalId: "p12",
      date: "2027-07-20",
      amount: 78.75,
      status: "pending",
      kind: "regular",
      description: "Academiablufit 12/12",
      name: "Academiablufit 12/12",
      paymentMethod: "credit_card",
      localCategoryName: "Saúde",
    })
  })
})
