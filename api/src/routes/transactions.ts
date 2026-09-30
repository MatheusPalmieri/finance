import { Elysia, t } from "elysia"
import { and, asc, count, desc, eq, gte, ilike, lte } from "drizzle-orm"
import { db } from "../db"
import { transactions } from "../db/schema"
import { isPaymentMethod } from "../lib/payment-methods"
import { REAL_TRANSACTIONS } from "../lib/scope"
import { scheduleRecalculate } from "../modules/classification"

// Transações são somente leitura na origem: todas vêm do Open Finance (sync).
// Não existe criar, importar nem excluir — valor, data, conta, status,
// natureza e forma de pagamento são do banco. O usuário só ajusta a
// CLASSIFICAÇÃO (nome, categoria, observação), que o sync nunca sobrescreve
// (ver modules/open-finance/sync.ts). A categoria decide o orçamento e o grupo
// 50/30/20 — não há vínculo por transação.

const classificationBody = t.Object({
  name: t.String({ minLength: 1 }),
  categoryId: t.String({ minLength: 1 }),
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
      if (query.from) conditions.push(gte(transactions.date, query.from))
      if (query.to) conditions.push(lte(transactions.date, query.to))
      if (query.search) conditions.push(ilike(transactions.name, `%${query.search}%`))

      const where = and(...conditions)
      // Ordenação vale só dentro do período filtrado; padrão: mais recente primeiro
      const orderBy =
        query.order === "asc"
          ? [asc(transactions.date), asc(transactions.createdAt)]
          : [desc(transactions.date), desc(transactions.createdAt)]

      const [data, [{ total }]] = await Promise.all([
        db.query.transactions.findMany({
          where,
          with: { account: true, category: true },
          orderBy,
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
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        order: t.Optional(t.String()),
      }),
    }
  )
  .get("/:id", async ({ params, status }) => {
    const transaction = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, params.id), REAL_TRANSACTIONS),
      with: { account: true, category: true },
    })
    if (!transaction) return status(404, { message: "Transação não encontrada" })
    return transaction
  })
  // Reclassificação: só os campos do usuário. Valor, data e conta vêm do banco
  .patch(
    "/:id",
    async ({ params, body, status }) => {
      const [transaction] = await db
        .update(transactions)
        .set({
          name: body.name,
          categoryId: body.categoryId,
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
