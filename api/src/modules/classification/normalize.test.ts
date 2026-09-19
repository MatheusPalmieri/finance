import { describe, expect, test } from "bun:test"
import {
  diceSimilarity,
  merchantKey,
  normalizeDescription,
  pixRecipientName,
  trigrams,
} from "./normalize"

describe("normalizeDescription", () => {
  test("remove acento e baixa a caixa", () => {
    expect(normalizeDescription("Transferência Recebida")).toBe(
      "transferencia recebida"
    )
  })

  test("remove o ruído do Pix do extrato NU", () => {
    const raw =
      "Transferência enviada pelo Pix - FULANO DE TAL - •••.811.569-•• - NU PAGAMENTOS - IP (0000000) Agência: 1 Conta: 123456-7"
    const normalized = normalizeDescription(raw)
    expect(normalized).toContain("transferencia enviada pelo pix")
    expect(normalized).toContain("fulano de tal")
    expect(normalized).not.toContain("nu pagamentos")
    expect(normalized).not.toContain("811.569")
  })

  test("remove parcelas e datas curtas", () => {
    expect(normalizeDescription("Netflix 12/24")).toBe("netflix")
    expect(normalizeDescription("Compra 03/11 Mercado")).toBe("compra mercado")
  })

  test("colapsa espaços", () => {
    expect(normalizeDescription("  A   B  ")).toBe("a b")
  })
})

describe("merchantKey", () => {
  test("variações da mesma loja geram a mesma chave", () => {
    expect(merchantKey("UBER *TRIP 8821")).toBe(merchantKey("UBER* TRIP SP"))
    expect(merchantKey("UBER *TRIP 8821")).toBe("uber trip")
  })

  test("ignora sufixo societário", () => {
    expect(merchantKey("Conceito Imobiliaria LTDA")).toBe(
      merchantKey("Conceito Imobiliaria")
    )
  })

  test("Pix para a mesma pessoa é estável entre meses", () => {
    const a =
      "Transferência enviada pelo Pix - FULANO DE TAL - •••.811.569-•• - NU PAGAMENTOS - IP"
    const b =
      "Transferência enviada pelo Pix - FULANO DE TAL - •••.811.569-•• - NU PAGAMENTOS - IP (999) Agência: 1"
    expect(merchantKey(a)).toBe(merchantKey(b))
  })

  test("limita a 6 palavras", () => {
    expect(merchantKey("um dois tres quatro cinco seis sete oito").split(" ")).toHaveLength(6)
  })

  test("descrição só de números vira chave vazia", () => {
    expect(merchantKey("123456")).toBe("")
  })
})

describe("pixRecipientName", () => {
  test("extrai o destinatário", () => {
    expect(
      pixRecipientName(
        "Transferência enviada pelo Pix - FULANO DE TAL - •••.811.569-•• - NU PAGAMENTOS - IP"
      )
    ).toBe("Pix para FULANO DE TAL")
  })

  test("devolve null quando não é Pix enviado", () => {
    expect(pixRecipientName("Compra no débito - Padaria")).toBeNull()
  })
})

describe("diceSimilarity", () => {
  test("idênticos dão 1", () => {
    expect(diceSimilarity(trigrams("netflix"), trigrams("netflix"))).toBe(1)
  })

  test("sem nada em comum dá 0", () => {
    expect(diceSimilarity(trigrams("abc"), trigrams("xyz"))).toBe(0)
  })

  test("conjunto vazio dá 0", () => {
    expect(diceSimilarity(new Set(), trigrams("netflix"))).toBe(0)
  })

  test("parecidos ficam entre 0 e 1", () => {
    const sim = diceSimilarity(trigrams("uber trip"), trigrams("uber trips"))
    expect(sim).toBeGreaterThan(0.75)
    expect(sim).toBeLessThan(1)
  })
})
