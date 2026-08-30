import { Elysia, t } from "elysia"
import { and, count, desc, eq, gte, ilike, lte, sql } from "drizzle-orm"
import { db } from "../db"
import { accounts, transactions } from "../db/schema"
import { isPaymentMethod } from "../lib/payment-methods"

// Aceita tanto `db` quanto o `tx` de uma `db.transaction()` — só precisa de `.update()`.
type Executor = Pick<typeof db, "update">

// Valor positivo = despesa (subtrai do saldo); valor negativo = entrada (soma ao saldo).
// Subtrair um valor negativo soma ao saldo, então a mesma função cobre os dois casos
// tanto ao aplicar quanto ao reverter (editar/excluir).
async function adjustBalance(
  exec: Executor,
  accountId: string,
  amount: string,
  direction: "add" | "subtract"
) {
  const op =
    direction === "add"
      ? sql`balance + ${amount}::numeric`
      : sql`balance - ${amount}::numeric`
  await exec.update(accounts).set({ balance: op }).where(eq(accounts.id, accountId))
}

const paymentMethodUnion = t.Union([
  t.Literal("cash"),
  t.Literal("pix"),
  t.Literal("credit_card"),
  t.Literal("debit_card"),
  t.Literal("boleto"),
  t.Literal("transfer"),
])

const transactionBody = t.Object({
  name: t.String({ minLength: 1 }),
  amount: t.Number(),
  categoryId: t.String({ minLength: 1 }),
  paymentMethod: paymentMethodUnion,
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
      if (query.paymentMethod && isPaymentMethod(query.paymentMethod))
        conditions.push(eq(transactions.paymentMethod, query.paymentMethod))
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
          with: { account: true, category: true, budget: true },
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
        paymentMethod: t.Optional(t.String()),
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
      with: { account: true, category: true },
    })
    if (!transaction) return status(404, { message: "Transação não encontrada" })
    return transaction
  })
  .post(
    "/",
    async ({ body, status }) => {
      if (body.amount === 0) return status(400, { message: "Informe um valor diferente de zero" })

      const resolved = resolveBudgetId(body)
      if ("message" in resolved) return status(400, { message: resolved.message })

      const amount = String(body.amount)

      const [transaction] = await db
        .insert(transactions)
        .values({
          name: body.name,
          amount,
          categoryId: body.categoryId,
          paymentMethod: body.paymentMethod,
          accountId: body.accountId,
          isEssential: body.isEssential,
          recurrence: body.recurrence,
          budgetId: resolved.budgetId,
          date: body.date,
          notes: body.notes ?? null,
        })
        .returning()

      await adjustBalance(db, body.accountId, amount, "subtract")

      return transaction
    },
    { body: transactionBody }
  )
  .put(
    "/:id",
    async ({ params, body, status }) => {
      if (body.amount === 0) return status(400, { message: "Informe um valor diferente de zero" })

      const existing = await db.query.transactions.findFirst({
        where: eq(transactions.id, params.id),
      })
      if (!existing) return status(404, { message: "Transação não encontrada" })

      const resolved = resolveBudgetId(body)
      if ("message" in resolved) return status(400, { message: resolved.message })

      // Reverte o efeito da transação antiga e aplica o da nova
      await adjustBalance(db, existing.accountId, existing.amount, "add")

      const newAmount = String(body.amount)
      await adjustBalance(db, body.accountId, newAmount, "subtract")

      const [transaction] = await db
        .update(transactions)
        .set({
          name: body.name,
          amount: newAmount,
          categoryId: body.categoryId,
          paymentMethod: body.paymentMethod,
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

    await adjustBalance(db, existing.accountId, existing.amount, "add")
    await db.delete(transactions).where(eq(transactions.id, params.id))
    return { success: true }
  })
  .post(
    "/bulk",
    async ({ body, status }) => {
      const resolvedItems: { item: TransactionBody; budgetId: string | null }[] = []
      for (const item of body.transactions) {
        if (item.amount === 0) {
          return status(400, { message: `Informe um valor diferente de zero em "${item.name}"` })
        }
        const resolved = resolveBudgetId(item)
        if ("message" in resolved) return status(400, { message: resolved.message })
        resolvedItems.push({ item, budgetId: resolved.budgetId })
      }

      // Transação única: se uma linha falhar no meio, nenhuma é aplicada
      const created = await db.transaction(async (tx) => {
        for (const { item, budgetId } of resolvedItems) {
          const amount = String(item.amount)
          await tx.insert(transactions).values({
            name: item.name,
            amount,
            categoryId: item.categoryId,
            paymentMethod: item.paymentMethod,
            accountId: item.accountId,
            isEssential: item.isEssential,
            recurrence: item.recurrence,
            budgetId,
            date: item.date,
            notes: item.notes ?? null,
          })
          await adjustBalance(tx, item.accountId, amount, "subtract")
        }
        return resolvedItems.length
      })

      return { created }
    },
    { body: t.Object({ transactions: t.Array(transactionBody, { minItems: 1 }) }) }
  )
