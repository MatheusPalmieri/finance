import { Elysia, t } from "elysia"
import { and, between, eq, ilike, sql } from "drizzle-orm"
import { db } from "../db"
import { budgets, transactions } from "../db/schema"
import { REAL_TRANSACTIONS } from "../lib/scope"

// Primeiro e último dia do mês ("YYYY-MM-DD")
function monthBounds(month: number, year: number) {
  const mm = String(month).padStart(2, "0")
  return {
    firstDay: `${year}-${mm}-01`,
    lastDay: `${year}-${mm}-${new Date(year, month, 0).getDate()}`,
  }
}

/**
 * Realizado do mês para a tela de Orçamentos. Regra (ver domain/budget.md):
 * - vinculada a um orçamento → grupo daquele orçamento;
 * - `kind = investment` sem vínculo → investimento, pelo líquido
 *   (aplicações − resgates);
 * - toda outra saída `regular` sem vínculo → variável (`desire`).
 * Essencial/não essencial não pesa aqui. Fatura e transferência entre contas
 * próprias ficam fora.
 */
async function buildSummary(month: number, year: number) {
  const { firstDay, lastDay } = monthBounds(month, year)
  const inMonth = and(REAL_TRANSACTIONS, between(transactions.date, firstDay, lastDay))
  const amount = sql`${transactions.amount}::numeric`

  const [totals] = await db
    .select({
      income: sql<string>`coalesce(-sum(${amount}) filter (where ${transactions.kind} = 'regular' and ${amount} < 0), 0)`,
      unlinkedVariable: sql<string>`coalesce(sum(${amount}) filter (where ${transactions.kind} = 'regular' and ${transactions.budgetId} is null and ${amount} > 0), 0)`,
      invested: sql<string>`coalesce(sum(${amount}) filter (where ${transactions.kind} = 'investment' and ${transactions.budgetId} is null and ${amount} > 0), 0)`,
      redeemed: sql<string>`coalesce(-sum(${amount}) filter (where ${transactions.kind} = 'investment' and ${transactions.budgetId} is null and ${amount} < 0), 0)`,
    })
    .from(transactions)
    .where(inMonth)

  // Soma líquida por orçamento (estorno abate)
  const linked = await db
    .select({
      budgetId: transactions.budgetId,
      type: budgets.type,
      spent: sql<string>`sum(${amount})`,
    })
    .from(transactions)
    .innerJoin(budgets, eq(transactions.budgetId, budgets.id))
    .where(and(inMonth, sql`${transactions.kind} in ('regular', 'investment')`))
    .groupBy(transactions.budgetId, budgets.type)

  const byType = { essential: 0, desire: 0, investment: 0 }
  const byBudget: Record<string, number> = {}
  for (const row of linked) {
    const value = Number(row.spent)
    byType[row.type] += value
    if (row.budgetId) byBudget[row.budgetId] = value
  }

  const invested = Number(totals?.invested ?? 0)
  const redeemed = Number(totals?.redeemed ?? 0)
  byType.desire += Number(totals?.unlinkedVariable ?? 0)
  byType.investment += invested - redeemed

  const round = (v: number) => Number(v.toFixed(2))
  return {
    month,
    year,
    income: round(Number(totals?.income ?? 0)),
    spentByType: {
      essential: round(byType.essential),
      desire: round(byType.desire),
      investment: round(byType.investment),
    },
    investmentFlow: { invested: round(invested), redeemed: round(redeemed) },
    spentByBudget: Object.fromEntries(
      Object.entries(byBudget).map(([id, v]) => [id, round(v)])
    ),
  }
}

const budgetBody = t.Object({
  name: t.String({ minLength: 1 }),
  type: t.Union([t.Literal("essential"), t.Literal("desire"), t.Literal("investment")]),
  amountType: t.Union([t.Literal("fixed"), t.Literal("variable")]),
  amount: t.Optional(t.Nullable(t.Number())),
  amountMin: t.Optional(t.Nullable(t.Number())),
  amountMax: t.Optional(t.Nullable(t.Number())),
})

type BudgetBody = typeof budgetBody.static

// Valida as regras condicionais de valor; retorna mensagem de erro ou null
function validateAmounts(body: BudgetBody): string | null {
  if (body.amountType === "fixed") {
    if (body.amount == null) return "Valor é obrigatório para orçamento de valor fixo"
  } else {
    if (body.amountMin == null || body.amountMax == null) {
      return "Valor mínimo e máximo são obrigatórios para orçamento em faixa"
    }
    if (body.amountMin >= body.amountMax) {
      return "O valor mínimo deve ser menor que o máximo"
    }
  }
  return null
}

// Normaliza os campos de valor conforme o tipo, zerando os que não se aplicam
function normalizeAmounts(body: BudgetBody) {
  if (body.amountType === "fixed") {
    return { amount: String(body.amount), amountMin: null, amountMax: null }
  }
  return {
    amount: null,
    amountMin: String(body.amountMin),
    amountMax: String(body.amountMax),
  }
}

export const budgetsRoute = new Elysia({ prefix: "/budgets" })
  .get(
    "/",
    ({ query }) => {
      if (query.name) {
        return db
          .select()
          .from(budgets)
          .where(ilike(budgets.name, `%${query.name}%`))
          .orderBy(budgets.name)
      }
      return db.select().from(budgets).orderBy(budgets.name)
    },
    { query: t.Object({ name: t.Optional(t.String()) }) }
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
  .get("/:id", async ({ params, status }) => {
    const [budget] = await db.select().from(budgets).where(eq(budgets.id, params.id))
    if (!budget) return status(404, { message: "Orçamento não encontrado" })
    return budget
  })
  .post(
    "/",
    async ({ body, status }) => {
      const invalid = validateAmounts(body)
      if (invalid) return status(400, { message: invalid })

      const [budget] = await db
        .insert(budgets)
        .values({
          name: body.name,
          type: body.type,
          amountType: body.amountType,
          ...normalizeAmounts(body),
        })
        .returning()
      return budget
    },
    { body: budgetBody }
  )
  .put(
    "/:id",
    async ({ params, body, status }) => {
      const invalid = validateAmounts(body)
      if (invalid) return status(400, { message: invalid })

      const [budget] = await db
        .update(budgets)
        .set({
          name: body.name,
          type: body.type,
          amountType: body.amountType,
          ...normalizeAmounts(body),
        })
        .where(eq(budgets.id, params.id))
        .returning()
      if (!budget) return status(404, { message: "Orçamento não encontrado" })
      return budget
    },
    { body: budgetBody }
  )
  .delete("/:id", async ({ params, status }) => {
    const [budget] = await db.delete(budgets).where(eq(budgets.id, params.id)).returning()
    if (!budget) return status(404, { message: "Orçamento não encontrado" })
    return { success: true }
  })
