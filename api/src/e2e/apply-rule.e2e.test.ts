// E2E do "aplicar às existentes": uma regra reaplicada no histórico, com prévia.

import { beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { classificationRules, transactions } from "../db/schema"
import {
  api,
  makeAccount,
  makeCategory,
  makeTransactions,
  resetDatabase,
} from "../test/helpers"

beforeEach(resetDatabase)

interface Preview {
  total: number
  data: { id: string; name: string; nextName: string; fields: string[] }[]
}

async function setup() {
  const account = await makeAccount("Nubank")
  const others = await makeCategory("Outros")
  const study = await makeCategory("Estudos")
  const rows = await makeTransactions([
    { name: "Yduqs 4/6", amount: 480, date: "2026-07-31", categoryId: others.id, accountId: account.id },
    { name: "Yduqs 5/6", amount: 480, date: "2026-08-31", categoryId: others.id, accountId: account.id },
    // Já corrigida à mão e renomeada: casa pelo nome do banco
    {
      name: "Faculdade",
      originalName: "Yduqs",
      amount: 480,
      date: "2026-09-07",
      categoryId: study.id,
      accountId: account.id,
    },
    { name: "Mercado", amount: 200, date: "2026-09-08", categoryId: others.id, accountId: account.id },
  ])
  const [rule] = await db
    .insert(classificationRules)
    .values({
      pattern: "yduqs",
      source: "manual",
      renameTo: "Faculdade",
      categoryId: study.id,
      paymentMethod: "boleto",
    })
    .returning()
  return { others, study, rows, rule }
}

describe("e2e — aplicar regra às existentes", () => {
  test("prévia lista só as que mudam, casando pelo nome do banco", async () => {
    const { rows, rule } = await setup()
    const res = await api.get<Preview>(`/classification/rules/${rule.id}/apply`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.data.map((r) => r.id).sort()).toEqual([rows[0].id, rows[1].id].sort())
    expect(res.body.data[0].nextName).toBe("Faculdade")
    expect(res.body.data[0].fields).toEqual(["name", "category"])
  })

  test("aplicar grava só a classificação e é idempotente", async () => {
    const { study, rows, rule } = await setup()
    const res = await api.post<{ applied: number }>(`/classification/rules/${rule.id}/apply`)
    expect(res.body.applied).toBe(2)

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, rows[0].id))
    expect(tx).toMatchObject({
      name: "Faculdade",
      categoryId: study.id,
      amount: "480.00",
      date: "2026-07-31",
      // Forma de pagamento é do Open Finance: a regra não a aplica no histórico
      paymentMethod: "credit_card",
    })
    const [market] = await db.select().from(transactions).where(eq(transactions.id, rows[3].id))
    expect(market.name).toBe("Mercado")

    const again = await api.post<{ applied: number }>(`/classification/rules/${rule.id}/apply`)
    expect(again.body.applied).toBe(0)
  })

  test("regra sem nome nem categoria não muda nada", async () => {
    const account = await makeAccount("Nubank")
    const others = await makeCategory("Outros")
    await makeTransactions([
      { name: "Pix para CARLA", amount: 30, date: "2026-09-01", categoryId: others.id, accountId: account.id },
    ])
    const [rule] = await db
      .insert(classificationRules)
      .values({ pattern: "carla", source: "manual", paymentMethod: "pix" })
      .returning()

    const preview = await api.get<Preview>(`/classification/rules/${rule.id}/apply`)
    expect(preview.body.total).toBe(0)
  })

  test("404 para regra inexistente", async () => {
    const id = crypto.randomUUID()
    expect((await api.get(`/classification/rules/${id}/apply`)).status).toBe(404)
    expect((await api.post(`/classification/rules/${id}/apply`)).status).toBe(404)
  })
})
