import { describe, expect, test } from "bun:test"
import type { ClassificationRule } from "../../db/schema"
import { matchRule, ruleToPatch, sortRules } from "./rules"

let seq = 0

function rule(partial: Partial<ClassificationRule>): ClassificationRule {
  return {
    id: `rule-${++seq}`,
    pattern: "x",
    matchType: "contains",
    source: "manual",
    priority: 100,
    renameTo: null,
    categoryId: null,
    paymentMethod: null,
    recurrence: null,
    isEssential: null,
    forceIncome: null,
    budgetId: null,
    enabled: true,
    hitCount: 0,
    lastHitAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  }
}

describe("matchRule", () => {
  test("casa por substring sem acento", () => {
    const rules = sortRules([rule({ pattern: "conceito imobiliaria" })])
    expect(matchRule(rules, "CONCEITO IMOBILIÁRIA LTDA")?.pattern).toBe(
      "conceito imobiliaria"
    )
  })

  test("prioridade maior é avaliada antes", () => {
    const generic = rule({ pattern: "matheus", priority: 100 })
    const specific = rule({
      pattern: "transferencia recebida - matheus",
      priority: 900,
    })
    const rules = sortRules([generic, specific])
    expect(matchRule(rules, "Transferência recebida - Matheus")?.id).toBe(
      specific.id
    )
  })

  test("pattern mais longo ganha no empate de prioridade", () => {
    const short = rule({ pattern: "pix", priority: 100 })
    const long = rule({ pattern: "pix enviado", priority: 100 })
    const rules = sortRules([short, long])
    expect(matchRule(rules, "Pix enviado para alguém")?.id).toBe(long.id)
  })

  test("regra desabilitada é ignorada", () => {
    const rules = sortRules([rule({ pattern: "netflix", enabled: false })])
    expect(matchRule(rules, "Netflix")).toBeNull()
  })

  test("matchType exact exige descrição normalizada idêntica", () => {
    const rules = sortRules([
      rule({ pattern: "Salário", matchType: "exact" }),
    ])
    expect(matchRule(rules, "salario")).not.toBeNull()
    expect(matchRule(rules, "salario da empresa")).toBeNull()
  })

  test("regex válida casa", () => {
    const rules = sortRules([
      rule({ pattern: "^compra de (fii|acoes)", matchType: "regex" }),
    ])
    expect(matchRule(rules, "Compra de FII XPML11")).not.toBeNull()
    expect(matchRule(rules, "Venda de FII XPML11")).toBeNull()
  })

  test("regex inválida desabilita a regra sem lançar", () => {
    const rules = sortRules([
      rule({ pattern: "([a-z", matchType: "regex", priority: 900 }),
      rule({ pattern: "netflix", priority: 100 }),
    ])
    expect(() => matchRule(rules, "Netflix")).not.toThrow()
    expect(matchRule(rules, "Netflix")?.pattern).toBe("netflix")
  })

  test("regra aprendida casa a descrição que a criou", () => {
    // O pattern das regras `learned` nasce de merchantKey(): sem pontuação,
    // sem números e sem sufixo de loja. Precisa casar mesmo assim.
    const rules = sortRules([rule({ pattern: "pag barbeariadoze" })])
    expect(matchRule(rules, "PAG*BarbeariaDoZe 4410")).not.toBeNull()
  })

  test("regra aprendida casa outras variações da mesma loja", () => {
    const rules = sortRules([rule({ pattern: "pag barbeariadoze" })])
    expect(matchRule(rules, "PAG* BarbeariaDoZe SP")).not.toBeNull()
  })

  test("sem regra que case devolve null", () => {
    const rules = sortRules([rule({ pattern: "netflix" })])
    expect(matchRule(rules, "Padaria do bairro")).toBeNull()
  })
})

describe("ruleToPatch", () => {
  test("só carrega o que a regra preencheu", () => {
    const patch = ruleToPatch(
      rule({ renameTo: "Aluguel", paymentMethod: "boleto" })
    )
    expect(patch.suggestedName).toBe("Aluguel")
    expect(patch.paymentMethod).toBe("boleto")
    expect(patch.categoryId).toBeNull()
    expect(patch.forceIncome).toBeNull()
  })
})
