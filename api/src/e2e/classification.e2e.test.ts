// E2E da spec 01 — classificação inteligente e recorrências.
// Exercita as rotas reais contra o banco de teste, sem rede.

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { db } from "../db"
import {
  classificationRules,
  type ClassificationRule,
  type RecurringSeries,
} from "../db/schema"
import { seedClassificationRules } from "../db/seed-rules"
import { invalidateRulesCache } from "../modules/classification/rules"
import type { SuggestResult } from "../modules/classification/types"
import {
  __setLlm,
  api,
  makeAccount,
  makeCategory,
  makeTransactions,
  monthsAgo,
  resetDatabase,
  useMockLlm,
  withAiDisabled,
} from "../test/helpers"

type SuggestBody = SuggestResult
// A lista enriquece a linha do banco com os sinais derivados na consulta
type RecurringRow = RecurringSeries & {
  monthlyCostBrl: number
  priceChangePct: number | null
  priceChangeSince: string | null
}
type RecurringBody = { data: RecurringRow[]; totalMonthly: number }

const PIX_RAW =
  "Transferência enviada pelo Pix - FULANO DE TAL - •••.811.569-•• - NU PAGAMENTOS - IP (0000000)"

beforeEach(resetDatabase)
afterEach(() => __setLlm(null))

async function seedWithCategories() {
  const moradia = await makeCategory("Moradia")
  const investimento = await makeCategory("Investimento")
  const transporte = await makeCategory("Transporte")
  await seedClassificationRules()
  invalidateRulesCache()
  return { moradia, investimento, transporte }
}

describe("e2e POST /classification/suggest — camada 1 (regras)", () => {
  test("as regras migradas do de-para produzem o mesmo resultado de antes", async () => {
    const { moradia, investimento, transporte } = await seedWithCategories()

    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: false,
      items: [
        { index: 0, description: "CONCEITO IMOBILIARIA LTDA" },
        { index: 1, description: "CELESC DISTRIBUICAO S.A." },
        { index: 2, description: "AYMORE CREDITO FINANCIAMENTO" },
        { index: 3, description: "Aplicação RDB" },
        { index: 4, description: "Compra no debito - Padaria" },
      ],
    })

    expect(res.status).toBe(200)
    const [aluguel, luz, carro, rdb, debito] = res.body.items

    expect(aluguel.source).toBe("rule")
    expect(aluguel.suggestedName).toBe("Aluguel")
    expect(aluguel.categoryId).toBe(moradia.id)
    expect(aluguel.paymentMethod).toBe("boleto")
    expect(aluguel.confidence).toBe(1)

    expect(luz.suggestedName).toBe("Conta de luz")
    expect(luz.categoryId).toBe(moradia.id)

    expect(carro.suggestedName).toBe("Financiamento do carro")
    expect(carro.categoryId).toBe(transporte.id)

    // "Aplicação RDB" vem negativa no extrato mas é receita para este usuário
    expect(rdb.forceIncome).toBe(true)
    expect(rdb.categoryId).toBe(investimento.id)

    expect(debito.paymentMethod).toBe("debit_card")
  })

  test("o destinatário do Pix é extraído da própria descrição", async () => {
    await seedWithCategories()

    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: false,
      items: [{ index: 0, description: PIX_RAW }],
    })

    expect(res.body.items[0].source).toBe("rule")
    expect(res.body.items[0].paymentMethod).toBe("pix")
    expect(res.body.items[0].suggestedName).toBe("Pix para FULANO DE TAL")
  })

  test("a regra mais específica vence a genérica", async () => {
    const salario = await makeCategory("Salário")
    await seedClassificationRules()
    invalidateRulesCache()

    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: false,
      items: [
        {
          index: 0,
          description: "Transferência recebida - MATHEUS ANDRE PALMIERI LTDA",
        },
      ],
    })

    expect(res.body.items[0].suggestedName).toBe("Salário")
    expect(res.body.items[0].categoryId).toBe(salario.id)
  })

  test("descrição sem regra volta como none e sem sugestão", async () => {
    await seedWithCategories()

    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: false,
      items: [{ index: 0, description: "Loja Absolutamente Desconhecida" }],
    })

    expect(res.body.items[0].source).toBe("none")
    expect(res.body.items[0].categoryId).toBeNull()
    expect(res.body.stats.none).toBe(1)
  })

  test("lista vazia responde 200 sem estatística", async () => {
    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: false,
      items: [],
    })
    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([])
  })

  test("o seed é idempotente — rodar duas vezes não duplica regra", async () => {
    await makeCategory("Moradia")
    const first = await seedClassificationRules()
    const second = await seedClassificationRules()
    expect(first.inserted).toBeGreaterThan(0)
    expect(second.inserted).toBe(0)
  })

  test("telemetria: a regra que casou tem hitCount incrementado", async () => {
    await seedWithCategories()
    await api.post("/classification/suggest", {
      useAi: false,
      items: [{ index: 0, description: "CONCEITO IMOBILIARIA" }],
    })

    // O registro de hits roda fora do caminho crítico da resposta
    await Bun.sleep(150)
    const [rule] = await db
      .select()
      .from(classificationRules)
      .where(eq(classificationRules.pattern, "conceito imobiliaria"))
    expect(rule.hitCount).toBeGreaterThanOrEqual(1)
    expect(rule.lastHitAt).not.toBeNull()
  })
})

describe("e2e POST /classification/suggest — camada 2 (histórico)", () => {
  test("deduz a categoria de transações parecidas já classificadas", async () => {
    const account = await makeAccount()
    const streaming = await makeCategory("Streaming")

    await makeTransactions(
      Array.from({ length: 5 }, (_, i) => ({
        name: "Netflix",
        amount: 55.9,
        date: monthsAgo(i + 1),
        categoryId: streaming.id,
        accountId: account.id,
        paymentMethod: "credit_card" as const,
      }))
    )

    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: false,
      items: [{ index: 0, description: "NETFLIX.COM 12/24" }],
    })

    const [item] = res.body.items
    expect(item.source).toBe("knn")
    expect(item.categoryId).toBe(streaming.id)
    expect(item.paymentMethod).toBe("credit_card")
    expect(item.confidence).toBeGreaterThanOrEqual(0.75)
    expect(item.confidence).toBeLessThanOrEqual(1)
  })

  test("histórico sem nada parecido não inventa categoria", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Alimentação")
    await makeTransactions([
      {
        name: "Padaria do Zé",
        amount: 12,
        date: monthsAgo(1),
        categoryId: category.id,
        accountId: account.id,
      },
    ])

    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: false,
      items: [{ index: 0, description: "Oficina Mecânica Silva" }],
    })

    expect(res.body.items[0].source).toBe("none")
  })
})

describe("e2e POST /classification/suggest — camada 3 (IA)", () => {
  test("classifica o resíduo e respeita a lista fechada de categorias", async () => {
    const lazer = await makeCategory("Lazer")

    useMockLlm(
      JSON.stringify({
        items: [
          {
            index: 0,
            categoryId: lazer.id,
            isEssential: false,
            recurrence: "variable",
            confidence: 1,
            suggestedName: "Cinema",
          },
        ],
      })
    )

    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: true,
      items: [{ index: 0, description: "CINEMARK SHOPPING" }],
    })

    expect(res.body.aiAvailable).toBe(true)
    const [item] = res.body.items
    expect(item.source).toBe("llm")
    expect(item.categoryId).toBe(lazer.id)
    expect(item.suggestedName).toBe("Cinema")
    // Sugestão de IA nunca chega com a confiança de uma regra determinística
    expect(item.confidence).toBe(0.9)
    expect(res.body.stats.llm).toBe(1)
  })

  test("nenhum valor monetário é enviado ao provedor", async () => {
    await makeCategory("Lazer")
    const mock = useMockLlm(JSON.stringify({ items: [] }))

    await api.post("/classification/suggest", {
      useAi: true,
      items: [
        {
          index: 0,
          description: "CINEMARK SHOPPING",
          date: "2026-09-03",
          amount: 1234.56,
        },
      ],
    })

    const sent = mock.calls
      .map((c) => `${c.req.system ?? ""} ${c.req.messages.map((m) => m.content).join(" ")}`)
      .join(" ")
    expect(sent).toContain("cinemark")
    expect(sent).not.toContain("1234.56")
    expect(sent).not.toContain("1.234,56")
    expect(sent).not.toContain("2026-09-03")
  })

  test("categoria inventada pelo modelo é neutralizada", async () => {
    await makeCategory("Lazer")
    useMockLlm(
      JSON.stringify({
        items: [
          {
            index: 0,
            categoryId: "00000000-0000-0000-0000-000000000000",
            isEssential: null,
            recurrence: null,
            confidence: 0.8,
            suggestedName: "Cinema",
          },
        ],
      })
    )

    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: true,
      items: [{ index: 0, description: "CINEMARK" }],
    })

    expect(res.body.items[0].categoryId).toBeNull()
    expect(res.body.items[0].suggestedName).toBe("Cinema")
  })

  test("linha omitida pelo modelo não quebra a importação", async () => {
    const lazer = await makeCategory("Lazer")
    useMockLlm(
      JSON.stringify({
        items: [
          {
            index: 1,
            categoryId: lazer.id,
            isEssential: null,
            recurrence: null,
            confidence: 0.9,
            suggestedName: "Cinema",
          },
        ],
      })
    )

    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: true,
      items: [
        { index: 0, description: "LOJA A" },
        { index: 1, description: "CINEMARK" },
      ],
    })

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(2)
    expect(res.body.items[0].source).toBe("none")
    expect(res.body.items[1].source).toBe("llm")
  })

  test("provedor fora do ar degrada para none, sem 500", async () => {
    await makeCategory("Lazer")
    useMockLlm(new Error("ollama caiu"), new Error("ollama caiu de novo"))

    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: true,
      items: [{ index: 0, description: "CINEMARK" }],
    })

    expect(res.status).toBe(200)
    expect(res.body.aiAvailable).toBe(false)
    expect(res.body.items[0].source).toBe("none")
  })

  test("com LLM_ENABLED=false a importação funciona e aiAvailable é false", async () => {
    await seedWithCategories()

    const res = await withAiDisabled(() =>
      api.post<SuggestBody>("/classification/suggest", {
        useAi: true,
        items: [
          { index: 0, description: "CONCEITO IMOBILIARIA" },
          { index: 1, description: "Loja Desconhecida" },
        ],
      })
    )

    expect(res.status).toBe(200)
    expect(res.body.aiAvailable).toBe(false)
    expect(res.body.items[0].source).toBe("rule")
    expect(res.body.items[1].source).toBe("none")
  })

  test("useAi: false pula a camada 3 sem sequer consultar o provedor", async () => {
    await makeCategory("Lazer")
    const mock = useMockLlm(JSON.stringify({ items: [] }))

    await api.post("/classification/suggest", {
      useAi: false,
      items: [{ index: 0, description: "CINEMARK" }],
    })

    expect(mock.calls).toHaveLength(0)
  })
})

describe("e2e POST /classification/feedback — aprendizado", () => {
  test("corrigir uma categoria cria a regra e a reimportação acerta sozinha", async () => {
    const beleza = await makeCategory("Beleza")
    const description = "PAG*BarbeariaDoZe 4410"

    const before = await api.post<SuggestBody>("/classification/suggest", {
      useAi: false,
      items: [{ index: 0, description }],
    })
    expect(before.body.items[0].source).toBe("none")

    const feedback = await api.post<{ ruleId: string; created: boolean }>(
      "/classification/feedback",
      {
        description,
        categoryId: beleza.id,
        paymentMethod: "credit_card",
        renameTo: "Barbearia",
      }
    )
    expect(feedback.status).toBe(200)
    expect(feedback.body.created).toBe(true)

    const after = await api.post<SuggestBody>("/classification/suggest", {
      useAi: false,
      items: [{ index: 0, description }],
    })
    expect(after.body.items[0].source).toBe("rule")
    expect(after.body.items[0].categoryId).toBe(beleza.id)
    expect(after.body.items[0].suggestedName).toBe("Barbearia")
  })

  test("a regra aprendida vale para outras variações da mesma loja", async () => {
    const beleza = await makeCategory("Beleza")
    await api.post("/classification/feedback", {
      description: "PAG*BarbeariaDoZe 4410",
      categoryId: beleza.id,
      renameTo: "Barbearia",
    })

    const res = await api.post<SuggestBody>("/classification/suggest", {
      useAi: false,
      items: [{ index: 0, description: "PAG* BarbeariaDoZe SP" }],
    })
    expect(res.body.items[0].source).toBe("rule")
    expect(res.body.items[0].categoryId).toBe(beleza.id)
  })

  test("corrigir de novo atualiza a regra aprendida em vez de duplicar", async () => {
    const beleza = await makeCategory("Beleza")
    const cuidados = await makeCategory("Cuidados pessoais")
    const description = "PAG*BarbeariaDoZe 4410"

    const first = await api.post<{ ruleId: string; created: boolean }>(
      "/classification/feedback",
      { description, categoryId: beleza.id }
    )
    const second = await api.post<{ ruleId: string; created: boolean }>(
      "/classification/feedback",
      { description, categoryId: cuidados.id }
    )

    expect(second.body.created).toBe(false)
    expect(second.body.ruleId).toBe(first.body.ruleId)

    const rules = await db.select().from(classificationRules)
    expect(rules).toHaveLength(1)
    expect(rules[0].categoryId).toBe(cuidados.id)
  })

  test("regra padrão não é sobrescrita — devolve 409 com o id em conflito", async () => {
    const { moradia } = await seedWithCategories()

    const res = await api.post<{ conflictRuleId: string; message: string }>(
      "/classification/feedback",
      { description: "conceito imobiliaria", categoryId: moradia.id }
    )

    expect(res.status).toBe(409)
    expect(res.body.conflictRuleId).toBeTruthy()
    expect(res.body.message).toContain("padrão")
  })

  test("createRule: false registra sem criar regra", async () => {
    const beleza = await makeCategory("Beleza")
    const res = await api.post("/classification/feedback", {
      description: "PAG*BarbeariaDoZe",
      categoryId: beleza.id,
      createRule: false,
    })

    expect(res.status).toBe(400)
    expect(await db.select().from(classificationRules)).toHaveLength(0)
  })

  test("descrição sem texto aproveitável devolve 400", async () => {
    const res = await api.post("/classification/feedback", {
      description: "123456",
      categoryId: null,
    })
    expect(res.status).toBe(400)
  })
})

describe("e2e CRUD /classification/rules", () => {
  test("cria, lista, edita, alterna e exclui", async () => {
    const category = await makeCategory("Moradia")

    const created = await api.post<ClassificationRule>("/classification/rules", {
      pattern: "aluguel teste",
      matchType: "contains",
      source: "manual",
      priority: 700,
      renameTo: "Aluguel",
      categoryId: category.id,
    })
    expect(created.status).toBe(200)
    expect(created.body.source).toBe("manual")

    const list = await api.get<ClassificationRule[]>("/classification/rules")
    expect(list.body).toHaveLength(1)

    const updated = await api.put<ClassificationRule>(
      `/classification/rules/${created.body.id}`,
      { pattern: "aluguel teste", renameTo: "Aluguel novo", priority: 800 }
    )
    expect(updated.body.renameTo).toBe("Aluguel novo")

    const toggled = await api.patch<ClassificationRule>(
      `/classification/rules/${created.body.id}/toggle`
    )
    expect(toggled.body.enabled).toBe(false)

    // Regra desligada não classifica mais
    const suggest = await api.post<SuggestBody>("/classification/suggest", {
      useAi: false,
      items: [{ index: 0, description: "Aluguel teste do mês" }],
    })
    expect(suggest.body.items[0].source).toBe("none")

    const removed = await api.delete(`/classification/rules/${created.body.id}`)
    expect(removed.status).toBe(200)
    expect((await api.get<ClassificationRule[]>("/classification/rules")).body).toHaveLength(0)
  })

  test("filtra por busca e por origem", async () => {
    await makeCategory("Moradia")
    await seedClassificationRules()
    await api.post("/classification/rules", {
      pattern: "manual teste",
      source: "manual",
    })

    const bySource = await api.get<ClassificationRule[]>(
      "/classification/rules?source=manual"
    )
    expect(bySource.body).toHaveLength(1)

    const bySearch = await api.get<ClassificationRule[]>(
      "/classification/rules?search=conceito"
    )
    expect(bySearch.body).toHaveLength(1)
    expect(bySearch.body[0].pattern).toBe("conceito imobiliaria")
  })

  test("regex inválida é recusada na criação", async () => {
    const res = await api.post<{ message: string }>("/classification/rules", {
      pattern: "([a-z",
      matchType: "regex",
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain("regular")
  })

  test("rota de regra inexistente devolve 404", async () => {
    const missing = "00000000-0000-0000-0000-000000000000"
    expect((await api.patch(`/classification/rules/${missing}/toggle`)).status).toBe(404)
    expect((await api.delete(`/classification/rules/${missing}`)).status).toBe(404)
  })

  test("preview mostra o que a regra casaria no histórico", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Moradia")
    await makeTransactions([
      {
        name: "CONCEITO IMOBILIARIA",
        amount: 1800,
        date: monthsAgo(1),
        categoryId: category.id,
        accountId: account.id,
      },
      {
        name: "Padaria",
        amount: 12,
        date: monthsAgo(1),
        categoryId: category.id,
        accountId: account.id,
      },
    ])

    const res = await api.post<{ matches: { name: string }[]; total: number }>(
      "/classification/rules/test",
      { pattern: "conceito", matchType: "contains" }
    )

    expect(res.body.total).toBe(1)
    expect(res.body.matches[0].name).toBe("CONCEITO IMOBILIARIA")
  })

  test("preview de regex inválida devolve 400", async () => {
    const res = await api.post("/classification/rules/test", {
      pattern: "([a-z",
      matchType: "regex",
    })
    expect(res.status).toBe(400)
  })

  test("preview de padrão vazio não explode", async () => {
    const res = await api.post<{ matches: unknown[]; total: number }>(
      "/classification/rules/test",
      { pattern: "   " }
    )
    expect(res.body.total).toBe(0)
  })
})

describe("e2e /recurring", () => {
  async function seedMonthlyCharges() {
    const account = await makeAccount()
    const category = await makeCategory("Streaming")
    await makeTransactions([
      // Assinatura estável: vira série
      ...Array.from({ length: 4 }, (_, i) => ({
        name: "Netflix",
        amount: 55.9,
        date: monthsAgo(4 - i, 5),
        categoryId: category.id,
        accountId: account.id,
      })),
      // Supermercado: valores muito variáveis, não é assinatura
      ...[300, 780, 410].map((amount, i) => ({
        name: "Mercado Bairro",
        amount,
        date: monthsAgo(3 - i, 12),
        categoryId: category.id,
        accountId: account.id,
      })),
    ])
    return { category }
  }

  test("detecta a assinatura e ignora o gasto instável", async () => {
    await seedMonthlyCharges()

    const recalc = await api.post<{ detected: number }>(
      "/recurring/recalculate"
    )
    expect(recalc.body.detected).toBe(1)

    const list = await api.get<RecurringBody>(`/recurring`)
    expect(list.body.data).toHaveLength(1)
    const [serie] = list.body.data
    expect(serie.merchantKey).toBe("netflix")
    expect(serie.intervalDays).toBe(30)
    expect(serie.occurrences).toBe(4)
    expect(serie.monthlyCostBrl).toBeCloseTo(55.9, 2)
  })

  test("aumento de preço é sinalizado", async () => {
    const account = await makeAccount()
    const category = await makeCategory("Streaming")
    await makeTransactions(
      [44.9, 44.9, 52.9, 52.9].map((amount, i) => ({
        name: "Spotify",
        amount,
        date: monthsAgo(4 - i, 5),
        categoryId: category.id,
        accountId: account.id,
      }))
    )

    await api.post("/recurring/recalculate")
    const list = await api.get<RecurringBody>(`/recurring`)

    expect(list.body.data[0].priceChangePct).toBeCloseTo(17.8, 1)
    expect(list.body.data[0].priceChangeSince).not.toBeNull()
  })

  test("dispensar esconde a série e ela sobrevive ao recálculo", async () => {
    await seedMonthlyCharges()
    await api.post("/recurring/recalculate")

    const [serie] = (await api.get<RecurringBody>(`/recurring`))
      .body.data
    expect((await api.patch(`/recurring/${serie.id}/dismiss`)).status).toBe(200)

    const hidden = await api.get<RecurringBody>(`/recurring`)
    expect(hidden.body.data).toHaveLength(0)

    // O recálculo não pode ressuscitar o que o usuário dispensou
    await api.post("/recurring/recalculate")
    const stillHidden = await api.get<RecurringBody>(
      `/recurring`
    )
    expect(stillHidden.body.data).toHaveLength(0)

    const withDismissed = await api.get<RecurringBody>(
      `/recurring?includeDismissed=true`
    )
    expect(withDismissed.body.data).toHaveLength(1)
    expect(withDismissed.body.data[0].dismissed).toBe(true)
  })

  test("lista as transações que compõem a série", async () => {
    await seedMonthlyCharges()
    await api.post("/recurring/recalculate")
    const [serie] = (await api.get<RecurringBody>(`/recurring`))
      .body.data

    const res = await api.get<{ data: { name: string }[] }>(
      `/recurring/${serie.id}/transactions`
    )
    expect(res.body.data).toHaveLength(4)
    expect(res.body.data.every((t) => t.name === "Netflix")).toBe(true)
  })

  test("série inexistente devolve 404", async () => {
    const missing = "00000000-0000-0000-0000-000000000000"
    expect((await api.patch(`/recurring/${missing}/dismiss`)).status).toBe(404)
    expect((await api.get(`/recurring/${missing}/transactions`)).status).toBe(404)
  })

  test("o total mensal soma apenas as séries ativas", async () => {
    await seedMonthlyCharges()
    await api.post("/recurring/recalculate")

    const list = await api.get<RecurringBody>(`/recurring`)
    const active = list.body.data.filter((s) => s.status === "ACTIVE")
    const expected = active.reduce((sum, s) => sum + s.monthlyCostBrl, 0)
    expect(list.body.totalMonthly).toBeCloseTo(expected, 2)
  })
})
