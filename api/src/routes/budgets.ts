import { Elysia, t } from "elysia"
import { and, between, eq, sql } from "drizzle-orm"
import { db } from "../db"
import { budgets, categories, transactions } from "../db/schema"
import { COUNTED_TRANSACTIONS, REAL_TRANSACTIONS } from "../lib/scope"
import { spendingByCategory, totalsByGroup } from "../lib/spending"

// Orçamento é o plano mensal de uma CATEGORIA (no máximo um por categoria). O
// realizado é o gasto da categoria no mês — não há vínculo por transação, então
// tudo que a classificação põe na categoria já conta. O grupo 50/30/20 mora na
// categoria e é editado junto com o plano. Ver domain/budget.md.

// Primeiro e último dia do mês ("YYYY-MM-DD")
function monthBounds(month: number, year: number) {
  const mm = String(month).padStart(2, "0")
  return {
    firstDay: `${year}-${mm}-01`,
    lastDay: `${year}-${mm}-${new Date(year, month, 0).getDate()}`,
  }
}

const round = (v: number) => Number(v.toFixed(2))

/** Realizado do mês: por grupo, por categoria e a renda que serve de base. */
async function buildSummary(month: number, year: number) {
  const { firstDay, lastDay } = monthBounds(month, year)
  const amount = sql`${transactions.amount}::numeric`

  const [spending, [totals]] = await Promise.all([
    spendingByCategory(firstDay, lastDay),
    db
      .select({
        income: sql<string>`coalesce(-sum(${amount}) filter (where ${COUNTED_TRANSACTIONS} and ${amount} < 0), 0)`,
        invested: sql<string>`coalesce(sum(${amount}) filter (where ${transactions.kind} = 'investment' and ${amount} > 0), 0)`,
        redeemed: sql<string>`coalesce(-sum(${amount}) filter (where ${transactions.kind} = 'investment' and ${amount} < 0), 0)`,
      })
      .from(transactions)
      .where(and(REAL_TRANSACTIONS, between(transactions.date, firstDay, lastDay))),
  ])

  const byGroup = totalsByGroup(spending)
  return {
    month,
    year,
    income: round(Number(totals?.income ?? 0)),
    spentByGroup: {
      essential: round(byGroup.essential),
      variable: round(byGroup.variable),
      investment: round(byGroup.investment),
    },
    investmentFlow: {
      invested: round(Number(totals?.invested ?? 0)),
      redeemed: round(Number(totals?.redeemed ?? 0)),
    },
    /** Gasto e nº de transações de cada categoria com movimento no mês. */
    spentByCategory: Object.fromEntries(
      spending.map((row) => [row.categoryId, { total: round(row.total), count: row.count }])
    ),
  }
}

const planBody = t.Object({
  group: t.Union([t.Literal("essential"), t.Literal("variable"), t.Literal("investment")]),
  // null = categoria sem orçamento (só o grupo é gravado)
  amountType: t.Nullable(t.Union([t.Literal("exact"), t.Literal("range")])),
  amount: t.Optional(t.Nullable(t.Number())),
  amountMin: t.Optional(t.Nullable(t.Number())),
  amountMax: t.Optional(t.Nullable(t.Number())),
})

type PlanBody = typeof planBody.static

// Valida os valores conforme a forma; retorna mensagem de erro ou null
function validateAmounts(body: PlanBody): string | null {
  if (body.amountType === "exact") {
    if (body.amount == null || body.amount <= 0) return "Informe um valor maior que zero"
  } else if (body.amountType === "range") {
    if (body.amountMin == null || body.amountMax == null) {
      return "Valor mínimo e máximo são obrigatórios para orçamento em faixa"
    }
    if (body.amountMin < 0) return "O valor mínimo não pode ser negativo"
    if (body.amountMin >= body.amountMax) return "O valor mínimo deve ser menor que o máximo"
  }
  return null
}

// Grava só os campos da forma escolhida, zerando os outros
function amountsOf(body: PlanBody) {
  if (body.amountType === "exact") {
    return { amountType: "exact" as const, amount: String(body.amount), amountMin: null, amountMax: null }
  }
  return {
    amountType: "range" as const,
    amount: null,
    amountMin: String(body.amountMin),
    amountMax: String(body.amountMax),
  }
}

export const budgetsRoute = new Elysia({ prefix: "/budgets" })
  .get("/", () =>
    db.query.budgets.findMany({ with: { category: true } })
  )
  .get(
    "/summary",
    ({ query }) => {
      const now = new Date()
      const month = Number(query.month) || now.getMonth() + 1
      const year = Number(query.year) || now.getFullYear()
      return buildSummary(month, year)
    },
    {
      query: t.Object({
        month: t.Optional(t.String()),
        year: t.Optional(t.String()),
      }),
    }
  )
  // Plano da categoria: grupo 50/30/20 + orçamento (cria, altera ou remove)
  .put(
    "/:categoryId",
    async ({ params, body, status }) => {
      const invalid = validateAmounts(body)
      if (invalid) return status(400, { message: invalid })

      const result = await db.transaction(async (tx) => {
        const [category] = await tx
          .update(categories)
          .set({ group: body.group })
          .where(eq(categories.id, params.categoryId))
          .returning()
        if (!category) return null

        if (body.amountType === null) {
          await tx.delete(budgets).where(eq(budgets.categoryId, category.id))
          return { category, budget: null }
        }

        const values = amountsOf(body)
        const [budget] = await tx
          .insert(budgets)
          .values({ categoryId: category.id, ...values })
          .onConflictDoUpdate({ target: budgets.categoryId, set: values })
          .returning()
        return { category, budget }
      })

      if (!result) return status(404, { message: "Categoria não encontrada" })
      return result
    },
    { body: planBody }
  )
  // Remove só o orçamento; a categoria e o grupo ficam
  .delete("/:categoryId", async ({ params, status }) => {
    const [budget] = await db
      .delete(budgets)
      .where(eq(budgets.categoryId, params.categoryId))
      .returning()
    if (!budget) return status(404, { message: "Orçamento não encontrado" })
    return { success: true }
  })
