// E2E do resumo da tela de Orçamentos: vinculada vai para o grupo do
// orçamento, investimento conta o líquido e o resto das saídas é variável.

import { beforeEach, describe, expect, test } from "bun:test"
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
  spentByType: { essential: number; desire: number; investment: number }
  investmentFlow: { invested: number; redeemed: number }
  spentByBudget: Record<string, number>
}

function dayIn(monthsBack: number, day: number): string {
  const { month, year } = monthOffset(monthsBack)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

beforeEach(resetDatabase)

describe("e2e — GET /budgets/summary", () => {
  test("separa fixo vinculado, investimento líquido e variável", async () => {
    const account = await makeAccount("Nubank")
    const category = await makeCategory("Geral")
    const rent = await makeBudget("Aluguel", { type: "essential", amount: 2000 })
    const gym = await makeBudget("Academia", { type: "desire", amount: 100 })
    const base = { categoryId: category.id, accountId: account.id }

    await makeTransaction({ ...base, name: "Salário", amount: -8000, date: dayIn(1, 5) })
    await makeTransaction({ ...base, name: "Aluguel", amount: 2000, date: dayIn(1, 5), recurrence: "fixed", budgetId: rent.id })
    await makeTransaction({ ...base, name: "Academia", amount: 100, date: dayIn(1, 6), recurrence: "fixed", budgetId: gym.id })
    // Essencial avulso não vai para o grupo fixo: entra como variável
    await makeTransaction({ ...base, name: "Mercado", amount: 600, date: dayIn(1, 7), isEssential: true })
    await makeTransaction({ ...base, name: "Aplicação RDB", amount: 1500, date: dayIn(1, 8), kind: "investment" })
    await makeTransaction({ ...base, name: "Resgate RDB", amount: -300, date: dayIn(1, 20), kind: "investment" })
    // Fora: fatura e transferência entre contas próprias
    await makeTransaction({ ...base, name: "Fatura", amount: 900, date: dayIn(1, 10), kind: "bill_payment" })
    await makeTransaction({ ...base, name: "Pix para mim", amount: 400, date: dayIn(1, 11), kind: "own_transfer" })
    // Outro mês não entra
    await makeTransaction({ ...base, name: "Mercado antigo", amount: 999, date: dayIn(2, 7) })

    const { month, year } = monthOffset(1)
    const res = await api.get<Summary>(`/budgets/summary?month=${month}&year=${year}`)

    expect(res.status).toBe(200)
    expect(res.body.income).toBe(8000)
    expect(res.body.spentByType).toEqual({ essential: 2000, desire: 700, investment: 1200 })
    expect(res.body.investmentFlow).toEqual({ invested: 1500, redeemed: 300 })
    expect(res.body.spentByBudget).toEqual({ [rent.id]: 2000, [gym.id]: 100 })
  })

  test("mês sem movimento volta zerado", async () => {
    const { month, year } = monthOffset(3)
    const res = await api.get<Summary>(`/budgets/summary?month=${month}&year=${year}`)

    expect(res.body.income).toBe(0)
    expect(res.body.spentByType).toEqual({ essential: 0, desire: 0, investment: 0 })
    expect(res.body.spentByBudget).toEqual({})
  })
})
