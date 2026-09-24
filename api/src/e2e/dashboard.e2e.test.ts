// E2E do painel inicial: ritmo contra o mês anterior, balde "sem classificação"
// e Recentes sem parcelas futuras.

import { beforeEach, describe, expect, test } from "bun:test"
import {
  api,
  makeAccount,
  makeCategory,
  makeTransaction,
  monthOffset,
  resetDatabase,
} from "../test/helpers"

interface Summary {
  totalExpenses: string
  essentialExpenses: string
  nonEssentialExpenses: string
  unclassifiedExpenses: string
  unclassifiedCount: number
  pace: { previousTotal: string; cutoffDay: number; partial: boolean }
  recentTransactions: { name: string }[]
}

function dayIn(monthsBack: number, day: number): string {
  const { month, year } = monthOffset(monthsBack)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

beforeEach(resetDatabase)

describe("e2e — dashboard", () => {
  test("mês fechado compara com o mês anterior inteiro", async () => {
    const account = await makeAccount("Nubank")
    const category = await makeCategory("Mercado")
    await makeTransaction({ name: "Atual", amount: 300, date: dayIn(2, 10), categoryId: category.id, accountId: account.id })
    await makeTransaction({ name: "Anterior", amount: 200, date: dayIn(3, 28), categoryId: category.id, accountId: account.id })

    const { month, year } = monthOffset(2)
    const res = await api.get<Summary>(`/dashboard/summary?month=${month}&year=${year}`)

    expect(res.body.pace.partial).toBe(false)
    expect(Number(res.body.pace.previousTotal)).toBe(200)
    expect(Number(res.body.totalExpenses)).toBe(300)
  })

  test("categoria de reserva do sync vai para o balde próprio, não para não essencial", async () => {
    const account = await makeAccount("Nubank")
    const category = await makeCategory("Mercado")
    await makeTransaction({ name: "Classificada", amount: 100, date: dayIn(2, 5), categoryId: category.id, accountId: account.id, isEssential: true })
    const outros = await makeCategory("Outros")
    await makeTransaction({ name: "Solta", amount: 40, date: dayIn(2, 6), categoryId: outros.id, accountId: account.id })

    const { month, year } = monthOffset(2)
    const res = await api.get<Summary>(`/dashboard/summary?month=${month}&year=${year}`)

    expect(Number(res.body.essentialExpenses)).toBe(100)
    expect(Number(res.body.nonEssentialExpenses)).toBe(0)
    expect(Number(res.body.unclassifiedExpenses)).toBe(40)
    expect(res.body.unclassifiedCount).toBe(1)
  })

  test("Recentes não mostra parcela com data futura", async () => {
    const account = await makeAccount("Nubank")
    const category = await makeCategory("Mercado")
    await makeTransaction({ name: "Passada", amount: 10, date: dayIn(1, 5), categoryId: category.id, accountId: account.id })
    await makeTransaction({ name: "Parcela futura", amount: 10, date: dayIn(-6, 5), categoryId: category.id, accountId: account.id })

    const res = await api.get<Summary>("/dashboard/summary")

    const names = res.body.recentTransactions.map((t) => t.name)
    expect(names).toContain("Passada")
    expect(names).not.toContain("Parcela futura")
  })
})
