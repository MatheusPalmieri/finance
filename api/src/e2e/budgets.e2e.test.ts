// E2E dos orçamentos por categoria: o plano mora na categoria (com o grupo
// 50/30/20) e o realizado é o gasto da categoria no mês — sem vínculo por
// transação. Investimento conta o líquido; fatura e transferência ficam fora.

import { beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { budgets, categories } from "../db/schema"
import {
  api,
  makeAccount,
  makeBudget,
  makeCategory,
  makeTransaction,
  monthOffset,
  resetDatabase,
} from "../test/helpers"

interface Summary {
  income: number
  spentByGroup: { essential: number; variable: number; investment: number }
  investmentFlow: { invested: number; redeemed: number }
  spentByCategory: Record<string, { total: number; count: number }>
}

function dayIn(monthsBack: number, day: number): string {
  const { month, year } = monthOffset(monthsBack)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

beforeEach(resetDatabase)

describe("e2e — GET /budgets/summary", () => {
  test("soma pela categoria e agrupa pelo grupo dela", async () => {
    const account = await makeAccount("Nubank")
    const salary = await makeCategory("Salário")
    const housing = await makeCategory("Moradia", { group: "essential" })
    const market = await makeCategory("Mercado", { group: "essential" })
    const food = await makeCategory("Alimentação")
    const invest = await makeCategory("Investimento", { group: "investment" })
    const on = (categoryId: string) => ({ categoryId, accountId: account.id })

    await makeTransaction({ ...on(salary.id), name: "Salário", amount: -8000, date: dayIn(1, 5) })
    await makeTransaction({ ...on(housing.id), name: "Aluguel", amount: 2000, date: dayIn(1, 5) })
    await makeTransaction({ ...on(housing.id), name: "Luz", amount: 250, date: dayIn(1, 9) })
    await makeTransaction({ ...on(market.id), name: "Giassi", amount: 600, date: dayIn(1, 7) })
    await makeTransaction({ ...on(food.id), name: "iFood", amount: 100, date: dayIn(1, 6) })
    await makeTransaction({ ...on(invest.id), name: "Aplicação RDB", amount: 1500, date: dayIn(1, 8), kind: "investment" })
    await makeTransaction({ ...on(invest.id), name: "Resgate RDB", amount: -300, date: dayIn(1, 20), kind: "investment" })
    // Fora: fatura e transferência entre contas próprias
    await makeTransaction({ ...on(food.id), name: "Fatura", amount: 900, date: dayIn(1, 10), kind: "bill_payment" })
    await makeTransaction({ ...on(food.id), name: "Pix para mim", amount: 400, date: dayIn(1, 11), kind: "own_transfer" })
    // Outro mês não entra
    await makeTransaction({ ...on(market.id), name: "Mercado antigo", amount: 999, date: dayIn(2, 7) })

    const { month, year } = monthOffset(1)
    const res = await api.get<Summary>(`/budgets/summary?month=${month}&year=${year}`)

    expect(res.status).toBe(200)
    expect(res.body.income).toBe(8000)
    expect(res.body.spentByGroup).toEqual({ essential: 2850, variable: 100, investment: 1200 })
    expect(res.body.investmentFlow).toEqual({ invested: 1500, redeemed: 300 })
    expect(res.body.spentByCategory).toEqual({
      [housing.id]: { total: 2250, count: 2 },
      [market.id]: { total: 600, count: 1 },
      [food.id]: { total: 100, count: 1 },
      [invest.id]: { total: 1200, count: 2 },
    })
  })

  test("mudar o grupo da categoria move o gasto de grupo", async () => {
    const account = await makeAccount("Nubank")
    const transport = await makeCategory("Transporte")
    await makeTransaction({ categoryId: transport.id, accountId: account.id, name: "Posto", amount: 300, date: dayIn(1, 3) })
    const { month, year } = monthOffset(1)

    const before = await api.get<Summary>(`/budgets/summary?month=${month}&year=${year}`)
    expect(before.body.spentByGroup.variable).toBe(300)

    await api.put(`/budgets/${transport.id}`, { group: "essential", amountType: null })
    const after = await api.get<Summary>(`/budgets/summary?month=${month}&year=${year}`)
    expect(after.body.spentByGroup).toEqual({ essential: 300, variable: 0, investment: 0 })
  })

  test("mês sem movimento volta zerado", async () => {
    const { month, year } = monthOffset(3)
    const res = await api.get<Summary>(`/budgets/summary?month=${month}&year=${year}`)

    expect(res.body.income).toBe(0)
    expect(res.body.spentByGroup).toEqual({ essential: 0, variable: 0, investment: 0 })
    expect(res.body.spentByCategory).toEqual({})
  })
})

describe("e2e — plano da categoria (PUT/DELETE /budgets/:categoryId)", () => {
  test("cria, altera e remove o orçamento, gravando o grupo junto", async () => {
    const housing = await makeCategory("Moradia")

    const created = await api.put<{ budget: { id: string; amountType: string; amount: string } }>(
      `/budgets/${housing.id}`,
      { group: "essential", amountType: "exact", amount: 2850 }
    )
    expect(created.status).toBe(200)
    expect(created.body.budget).toMatchObject({ amountType: "exact", amount: "2850.00" })

    // Trocar para faixa reaproveita a linha e zera o valor exato
    const updated = await api.put<{ budget: { id: string; amount: string | null; amountMax: string } }>(
      `/budgets/${housing.id}`,
      { group: "essential", amountType: "range", amountMin: 2700, amountMax: 3000 }
    )
    expect(updated.body.budget.id).toBe(created.body.budget.id)
    expect(updated.body.budget).toMatchObject({ amount: null, amountMax: "3000.00" })

    const [category] = await db.select().from(categories).where(eq(categories.id, housing.id))
    expect(category.group).toBe("essential")

    // amountType null = sem orçamento; o grupo fica
    await api.put(`/budgets/${housing.id}`, { group: "essential", amountType: null })
    expect(await db.select().from(budgets)).toHaveLength(0)

    await makeBudget(housing.id, { amount: 100 })
    expect((await api.delete(`/budgets/${housing.id}`)).status).toBe(200)
    expect((await api.delete(`/budgets/${housing.id}`)).status).toBe(404)
  })

  test("valida os valores conforme a forma", async () => {
    const housing = await makeCategory("Moradia")
    const put = (body: object) => api.put(`/budgets/${housing.id}`, { group: "essential", ...body })

    expect((await put({ amountType: "exact" })).status).toBe(400)
    expect((await put({ amountType: "exact", amount: 0 })).status).toBe(400)
    expect((await put({ amountType: "range", amountMin: 500 })).status).toBe(400)
    expect((await put({ amountType: "range", amountMin: 800, amountMax: 500 })).status).toBe(400)
  })

  test("categoria inexistente dá 404", async () => {
    const res = await api.put(`/budgets/${crypto.randomUUID()}`, {
      group: "variable",
      amountType: "exact",
      amount: 10,
    })
    expect(res.status).toBe(404)
  })

  test("excluir a categoria leva o orçamento junto", async () => {
    const gym = await makeCategory("Academia")
    await makeBudget(gym.id, { amount: 80 })
    expect((await api.delete(`/categories/${gym.id}`)).status).toBe(200)
    expect(await db.select().from(budgets)).toHaveLength(0)
  })

  test("GET /budgets devolve cada orçamento com a categoria", async () => {
    const housing = await makeCategory("Moradia", { group: "essential" })
    await makeBudget(housing.id, { amountMin: 2700, amountMax: 3000 })

    const res = await api.get<{ amountType: string; category: { name: string; group: string } }[]>("/budgets")
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({
      amountType: "range",
      category: { name: "Moradia", group: "essential" },
    })
  })
})
