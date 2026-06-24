import { Elysia, t } from "elysia"
import { and, count, desc, eq, gte, ilike, lte, sql } from "drizzle-orm"
import { db } from "../db"
import { accounts, transactions } from "../db/schema"

// Toda transação é uma despesa: ao criar, subtrai do saldo da conta;
// ao reverter (editar/excluir), devolve o valor.
async function adjustBalance(
  accountId: string,
  amount: string,
  direction: "add" | "subtract"
) {
  const op =
    direction === "add"
      ? sql`balance + ${amount}::numeric`
      : sql`balance - ${amount}::numeric`
  await db.update(accounts).set({ balance: op }).where(eq(accounts.id, accountId))
}

const transactionBody = t.Object({
  name: t.String({ minLength: 1 }),
  amount: t.Number({ minimum: 0.01 }),
  categoryId: t.String({ minLength: 1 }),
  paymentMethodId: t.String({ minLength: 1 }),
  accountId: t.String({ minLength: 1 }),
  isEssential: t.Boolean(),
  recurrence: t.Union([t.Literal("fixed"), t.Literal("variable")]),
  budgetId: t.Optional(t.Nullable(t.String())),
  date: t.String({ minLength: 1 }),
  notes: t.Optional(t.Nullable(t.String())),
})

type TransactionBody = typeof transactionBody.static

// Em gasto fixo o orçamento é obrigatório; em variável é sempre nulo.
// Retorna o budgetId resolvido ou uma mensagem de erro.
function resolveBudgetId(body: TransactionBody): { budgetId: string | null } | { message: string } {
  if (body.recurrence === "fixed") {
    if (!body.budgetId) return { message: "Selecione o orçamento vinculado ao gasto fixo" }
    return { budgetId: body.budgetId }
  }
  return { budgetId: null }
}

export const transactionsRoute = new Elysia({ prefix: "/transactions" })
  .get(
    "/",
    async ({ query }) => {
      const page = Math.max(1, Number(query.page) || 1)
      const limit = Math.min(100, Number(query.limit) || 20)
      const offset = (page - 1) * limit

      const conditions = []
      if (query.accountId) conditions.push(eq(transactions.accountId, query.accountId))
      if (query.categoryId) conditions.push(eq(transactions.categoryId, query.categoryId))
      if (query.paymentMethodId)
        conditions.push(eq(transactions.paymentMethodId, query.paymentMethodId))
      if (query.recurrence === "fixed" || query.recurrence === "variable")
        conditions.push(eq(transactions.recurrence, query.recurrence))
      if (query.isEssential === "true") conditions.push(eq(transactions.isEssential, true))
      if (query.isEssential === "false") conditions.push(eq(transactions.isEssential, false))
      if (query.from) conditions.push(gte(transactions.date, query.from))
      if (query.to) conditions.push(lte(transactions.date, query.to))
      if (query.search) conditions.push(ilike(transactions.name, `%${query.search}%`))

      const where = conditions.length > 0 ? and(...conditions) : undefined

      const [data, [{ total }]] = await Promise.all([
        db.query.transactions.findMany({
          where,
          with: { account: true, category: true, paymentMethod: true, budget: true },
          orderBy: [desc(transactions.date), desc(transactions.createdAt)],
          limit,
          offset,
        }),
        db.select({ total: count() }).from(transactions).where(where),
      ])

      return { data, total, page, limit }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
        accountId: t.Optional(t.String()),
        categoryId: t.Optional(t.String()),
        paymentMethodId: t.Optional(t.String()),
        recurrence: t.Optional(t.String()),
        isEssential: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    }
  )
  .get("/:id", async ({ params, status }) => {
    const transaction = await db.query.transactions.findFirst({
      where: eq(transactions.id, params.id),
      with: { account: true, category: true, paymentMethod: true },
    })
    if (!transaction) return status(404, { message: "Transação não encontrada" })
    return transaction
  })
  .post(
    "/",
    async ({ body, status }) => {
      const resolved = resolveBudgetId(body)
      if ("message" in resolved) return status(400, { message: resolved.message })

      const amount = String(body.amount)

      const [transaction] = await db
        .insert(transactions)
        .values({
          name: body.name,
          amount,
          categoryId: body.categoryId,
          paymentMethodId: body.paymentMethodId,
          accountId: body.accountId,
          isEssential: body.isEssential,
          recurrence: body.recurrence,
          budgetId: resolved.budgetId,
          date: body.date,
          notes: body.notes ?? null,
        })
        .returning()

      await adjustBalance(body.accountId, amount, "subtract")

      return transaction
    },
    { body: transactionBody }
  )
  .put(
    "/:id",
    async ({ params, body, status }) => {
      const existing = await db.query.transactions.findFirst({
        where: eq(transactions.id, params.id),
      })
      if (!existing) return status(404, { message: "Transação não encontrada" })

      const resolved = resolveBudgetId(body)
      if ("message" in resolved) return status(400, { message: resolved.message })

      // Reverte o efeito da transação antiga e aplica o da nova
      await adjustBalance(existing.accountId, existing.amount, "add")

      const newAmount = String(body.amount)
      await adjustBalance(body.accountId, newAmount, "subtract")

      const [transaction] = await db
        .update(transactions)
        .set({
          name: body.name,
          amount: newAmount,
          categoryId: body.categoryId,
          paymentMethodId: body.paymentMethodId,
          accountId: body.accountId,
          isEssential: body.isEssential,
          recurrence: body.recurrence,
          budgetId: resolved.budgetId,
          date: body.date,
          notes: body.notes ?? null,
        })
        .where(eq(transactions.id, params.id))
        .returning()

      return transaction
    },
    { body: transactionBody }
  )
  .delete("/:id", async ({ params, status }) => {
    const existing = await db.query.transactions.findFirst({
      where: eq(transactions.id, params.id),
    })
    if (!existing) return status(404, { message: "Transação não encontrada" })

    await adjustBalance(existing.accountId, existing.amount, "add")
    await db.delete(transactions).where(eq(transactions.id, params.id))
    return { success: true }
  })
