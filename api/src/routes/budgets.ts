import { Elysia, t } from "elysia"
import { eq, ilike } from "drizzle-orm"
import { db } from "../db"
import { budgets } from "../db/schema"

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
    if (body.amount == null) return "Valor é obrigatório para orçamento fixo"
  } else {
    if (body.amountMin == null || body.amountMax == null) {
      return "Valor mínimo e máximo são obrigatórios para orçamento variável"
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
