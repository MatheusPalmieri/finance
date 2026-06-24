import { Elysia, t } from "elysia"
import { desc, eq, ilike, sql } from "drizzle-orm"
import { db } from "../db"
import {
  investmentContributions,
  investments,
  type Investment,
} from "../db/schema"
import { computeProjection } from "../lib/investment"

const investmentBody = t.Object({
  name: t.String({ minLength: 1 }),
  type: t.Union([
    t.Literal("stock"),
    t.Literal("cdi"),
    t.Literal("fii"),
    t.Literal("treasury"),
    t.Literal("crypto"),
    t.Literal("fund"),
  ]),
  goalAmount: t.Optional(t.Nullable(t.Number())),
  monthlyContribution: t.Optional(t.Nullable(t.Number())),
})

const contributionBody = t.Object({
  // deposit (aporte) soma ao current_amount; withdrawal (retirada) subtrai
  type: t.Optional(t.Union([t.Literal("deposit"), t.Literal("withdrawal")])),
  // Valor do movimento, sempre positivo; o sinal vem do `type`
  amount: t.Number({ minimum: 0.01 }),
  date: t.Optional(t.String()),
  notes: t.Optional(t.Nullable(t.String())),
})

// Anexa a projeção de prazo calculada ao investimento
function withProjection(inv: Investment) {
  return { ...inv, projection: computeProjection(inv) }
}

// Converte número opcional em string para colunas numeric (ou null)
function toNumeric(value: number | null | undefined): string | null {
  return value != null ? String(value) : null
}

export const investmentsRoute = new Elysia({ prefix: "/investments" })
  .get(
    "/",
    async ({ query }) => {
      const rows = query.name
        ? await db
            .select()
            .from(investments)
            .where(ilike(investments.name, `%${query.name}%`))
            .orderBy(investments.name)
        : await db.select().from(investments).orderBy(investments.name)
      return rows.map(withProjection)
    },
    { query: t.Object({ name: t.Optional(t.String()) }) }
  )
  .get("/:id", async ({ params, status }) => {
    const [inv] = await db.select().from(investments).where(eq(investments.id, params.id))
    if (!inv) return status(404, { message: "Investimento não encontrado" })
    return withProjection(inv)
  })
  .post(
    "/",
    async ({ body }) => {
      // current_amount sempre inicia em 0 — só sobe via aportes
      const [inv] = await db
        .insert(investments)
        .values({
          name: body.name,
          type: body.type,
          goalAmount: toNumeric(body.goalAmount),
          monthlyContribution: toNumeric(body.monthlyContribution),
        })
        .returning()
      return withProjection(inv)
    },
    { body: investmentBody }
  )
  .put(
    "/:id",
    async ({ params, body, status }) => {
      // Não altera current_amount — atualização de valor é exclusiva dos aportes
      const [inv] = await db
        .update(investments)
        .set({
          name: body.name,
          type: body.type,
          goalAmount: toNumeric(body.goalAmount),
          monthlyContribution: toNumeric(body.monthlyContribution),
        })
        .where(eq(investments.id, params.id))
        .returning()
      if (!inv) return status(404, { message: "Investimento não encontrado" })
      return withProjection(inv)
    },
    { body: investmentBody }
  )
  .delete("/:id", async ({ params, status }) => {
    // Aportes são removidos em cascata (FK onDelete: cascade)
    const [inv] = await db.delete(investments).where(eq(investments.id, params.id)).returning()
    if (!inv) return status(404, { message: "Investimento não encontrado" })
    return { success: true }
  })

  // ── Aportes ────────────────────────────────────────────────────────────────
  .get("/:id/contributions", async ({ params, status }) => {
    const [inv] = await db.select().from(investments).where(eq(investments.id, params.id))
    if (!inv) return status(404, { message: "Investimento não encontrado" })
    return db
      .select()
      .from(investmentContributions)
      .where(eq(investmentContributions.investmentId, params.id))
      .orderBy(desc(investmentContributions.date), desc(investmentContributions.createdAt))
  })
  .post(
    "/:id/contributions",
    async ({ params, body, status }) => {
      const [inv] = await db.select().from(investments).where(eq(investments.id, params.id))
      if (!inv) return status(404, { message: "Investimento não encontrado" })

      const amount = String(body.amount)
      const type = body.type ?? "deposit"
      const [contribution] = await db
        .insert(investmentContributions)
        .values({
          investmentId: params.id,
          type,
          amount,
          date: body.date ?? undefined,
          notes: body.notes ?? null,
        })
        .returning()

      // Aporte soma, retirada subtrai (sem ficar negativo). updated_at via $onUpdate
      const currentAmount =
        type === "deposit"
          ? sql`${investments.currentAmount} + ${amount}::numeric`
          : sql`GREATEST(0, ${investments.currentAmount} - ${amount}::numeric)`
      await db
        .update(investments)
        .set({ currentAmount })
        .where(eq(investments.id, params.id))

      return contribution
    },
    { body: contributionBody }
  )
  .delete("/:id/contributions/:contributionId", async ({ params, status }) => {
    const [contribution] = await db
      .select()
      .from(investmentContributions)
      .where(eq(investmentContributions.id, params.contributionId))
    if (!contribution || contribution.investmentId !== params.id) {
      return status(404, { message: "Aporte não encontrado" })
    }

    await db
      .delete(investmentContributions)
      .where(eq(investmentContributions.id, params.contributionId))

    // Reverte o movimento: remover um aporte subtrai; remover uma retirada soma
    const currentAmount =
      contribution.type === "deposit"
        ? sql`GREATEST(0, ${investments.currentAmount} - ${contribution.amount}::numeric)`
        : sql`${investments.currentAmount} + ${contribution.amount}::numeric`
    await db
      .update(investments)
      .set({ currentAmount })
      .where(eq(investments.id, params.id))

    return { success: true }
  })
