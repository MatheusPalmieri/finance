// Gasto do plano: a mesma conta para a tela de Orçamentos, o check-up e o
// Início. Antes cada tela tinha a sua regra de 50/30/20 e os números não
// batiam entre elas (ver domain/budget.md).
//
// Regra única:
// - o que conta é saída `regular` (amount > 0) e o líquido das aplicações
//   (`kind = investment`: aplicação soma, resgate abate);
// - fatura e transferência entre contas próprias ficam fora;
// - cada transação cai na categoria em que está, e a categoria define o grupo.

import { and, between, eq, sql } from "drizzle-orm"
import { db } from "../db"
import { categories, transactions, type SpendingGroup } from "../db/schema"
import { REAL_TRANSACTIONS } from "./scope"

export const SPENDING_GROUPS: SpendingGroup[] = ["essential", "variable", "investment"]

/** Metas da regra 50/30/20, em % da renda. */
export const GROUP_TARGETS: Record<SpendingGroup, number> = {
  essential: 50,
  variable: 30,
  investment: 20,
}

export const PLANNED_SPENDING = sql`(${REAL_TRANSACTIONS} and (${transactions.kind} = 'investment' or (${transactions.kind} = 'regular' and ${transactions.amount}::numeric > 0)))`

export interface CategorySpending {
  categoryId: string
  name: string
  color: string
  group: SpendingGroup
  /** Soma líquida no período; em investimento pode ser negativa (resgatou mais). */
  total: number
  count: number
}

/** Gasto do plano por categoria no período (só categorias com movimento). */
export async function spendingByCategory(from: string, to: string): Promise<CategorySpending[]> {
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      color: categories.color,
      group: categories.group,
      total: sql<string>`sum(${transactions.amount}::numeric)`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(between(transactions.date, from, to), PLANNED_SPENDING))
    .groupBy(categories.id, categories.name, categories.color, categories.group)

  return rows.map((row) => ({ ...row, total: Number(row.total) }))
}

/** Soma por grupo 50/30/20. */
export function totalsByGroup(rows: Pick<CategorySpending, "group" | "total">[]) {
  const out: Record<SpendingGroup, number> = { essential: 0, variable: 0, investment: 0 }
  for (const row of rows) out[row.group] += row.total
  return out
}
