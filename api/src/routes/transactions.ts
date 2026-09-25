import { Elysia, t } from "elysia"
import { and, count, desc, eq, gte, ilike, lte, sql } from "drizzle-orm"
import { db } from "../db"
import { transactions } from "../db/schema"
import { isPaymentMethod } from "../lib/payment-methods"
import { REAL_TRANSACTIONS } from "../lib/scope"
import { scheduleRecalculate } from "../modules/classification"

// Transações são somente leitura na origem: todas vêm do Open Finance (sync).
// Não existe criar, importar nem excluir — valor, data, conta, status,
// natureza e forma de pagamento são do banco. O usuário só ajusta a
// CLASSIFICAÇÃO, que o sync nunca sobrescreve (ver modules/open-finance/sync.ts).

const classificationBody = t.Object({
  name: t.String({ minLength: 1 }),
  categoryId: t.String({ minLength: 1 }),
  isEssential: t.Boolean(),
  recurrence: t.Union([t.Literal("fixed"), t.Literal("variable")]),
  budgetId: t.Optional(t.Nullable(t.String())),
  notes: t.Optional(t.Nullable(t.String())),
})

export const transactionsRoute = new Elysia({ prefix: "/transactions" })
  .get(
    "/",
    async ({ query }) => {
      const page = Math.max(1, Number(query.page) || 1)
      const limit = Math.min(100, Number(query.limit) || 20)
      const offset = (page - 1) * limit

      const conditions = [REAL_TRANSACTIONS]
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

      const where = and(...conditions)

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
      where: and(eq(transactions.id, params.id), REAL_TRANSACTIONS),
      with: { account: true, category: true, budget: true },
    })
    if (!transaction) return status(404, { message: "Transação não encontrada" })
    return transaction
  })
  // Reclassificação: só os campos do usuário. Valor, data e conta vêm do banco
  .patch(
    "/:id",
    async ({ params, body, status }) => {
      // Em gasto fixo o orçamento é obrigatório; em variável é sempre nulo
      if (body.recurrence === "fixed" && !body.budgetId) {
        return status(400, { message: "Selecione o orçamento vinculado ao gasto fixo" })
      }

      const [transaction] = await db
        .update(transactions)
        .set({
          name: body.name,
          categoryId: body.categoryId,
          // Entrada (valor negativo) nunca é essencial — resolvido no banco
          // porque o valor não vem no corpo
          isEssential: sql`(${transactions.amount} >= 0 and ${body.isEssential})`,
          recurrence: body.recurrence,
          budgetId: body.recurrence === "fixed" ? body.budgetId! : null,
          notes: body.notes ?? null,
        })
        .where(and(eq(transactions.id, params.id), REAL_TRANSACTIONS))
        .returning()
      if (!transaction) return status(404, { message: "Transação não encontrada" })

      scheduleRecalculate()
      return transaction
    },
    { body: classificationBody }
  )
