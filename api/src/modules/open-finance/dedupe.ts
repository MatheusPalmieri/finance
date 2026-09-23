// Caminho inverso da adoção do sync: um extrato CSV importado DEPOIS do Open
// Finance não pode duplicar o que o sync já trouxe. Mesma regra de casamento
// da adoção (mesma conta, mesmo valor absoluto, até 1 dia de diferença), cada
// linha do Open Finance cobrindo no máximo uma linha do extrato.

import { and, eq, gte, inArray, lte } from "drizzle-orm"
import { db } from "../../db"
import { transactions } from "../../db/schema"

const MAX_DAYS = 1

export interface DedupeCandidate {
  accountId: string
  date: string
  amount: number | string
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function distance(a: string, b: string): number {
  return Math.abs(new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86_400_000
}

/** Índices das linhas que já existem como transação do Open Finance. */
export async function coveredByOpenFinance(items: DedupeCandidate[]): Promise<Set<number>> {
  const covered = new Set<number>()
  if (items.length === 0) return covered

  const dates = items.map((i) => i.date).sort()
  const existing = await db
    .select({ id: transactions.id, accountId: transactions.accountId, date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.source, "open_finance"),
        inArray(transactions.accountId, [...new Set(items.map((i) => i.accountId))]),
        gte(transactions.date, shiftDays(dates[0], -MAX_DAYS)),
        lte(transactions.date, shiftDays(dates[dates.length - 1], MAX_DAYS))
      )
    )

  const used = new Set<string>()
  items.forEach((item, index) => {
    const magnitude = Math.abs(Number(item.amount))
    let best: { id: string; d: number } | null = null
    for (const row of existing) {
      if (used.has(row.id) || row.accountId !== item.accountId) continue
      if (Math.abs(Math.abs(Number(row.amount)) - magnitude) >= 0.005) continue
      const d = distance(row.date, item.date)
      if (d <= MAX_DAYS && (!best || d < best.d)) best = { id: row.id, d }
    }
    if (best) {
      used.add(best.id)
      covered.add(index)
    }
  })
  return covered
}
