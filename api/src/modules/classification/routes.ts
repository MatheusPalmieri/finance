import { Elysia, t } from "elysia"
import * as service from "./service"
import type { RecurringStatus, RuleMatchType, RuleSource } from "../../db/schema"

const paymentMethodUnion = t.Union([
  t.Literal("cash"),
  t.Literal("pix"),
  t.Literal("credit_card"),
  t.Literal("debit_card"),
  t.Literal("boleto"),
  t.Literal("transfer"),
])

const recurrenceUnion = t.Union([t.Literal("fixed"), t.Literal("variable")])
const matchTypeUnion = t.Union([
  t.Literal("contains"),
  t.Literal("exact"),
  t.Literal("regex"),
])

const ruleBody = t.Object({
  pattern: t.String({ minLength: 1 }),
  matchType: t.Optional(matchTypeUnion),
  source: t.Optional(
    t.Union([t.Literal("seed"), t.Literal("manual"), t.Literal("learned")])
  ),
  priority: t.Optional(t.Number()),
  renameTo: t.Optional(t.Nullable(t.String())),
  categoryId: t.Optional(t.Nullable(t.String())),
  paymentMethod: t.Optional(t.Nullable(paymentMethodUnion)),
  recurrence: t.Optional(t.Nullable(recurrenceUnion)),
  isEssential: t.Optional(t.Nullable(t.Boolean())),
  forceIncome: t.Optional(t.Nullable(t.Boolean())),
  budgetId: t.Optional(t.Nullable(t.String())),
  enabled: t.Optional(t.Boolean()),
})

export const classificationRoute = new Elysia({ prefix: "/classification" })
  // Coração da spec: recebe descrições cruas, devolve sugestões com origem.
  .post(
    "/suggest",
    ({ body }) =>
      service.suggest({
        walletId: body.walletId ?? null,
        useAi: body.useAi,
        items: body.items,
      }),
    {
      body: t.Object({
        walletId: t.Optional(t.Nullable(t.String())),
        useAi: t.Optional(t.Boolean()),
        items: t.Array(
          t.Object({
            index: t.Number(),
            description: t.String(),
            date: t.Optional(t.String()),
            amount: t.Optional(t.Number()),
          })
        ),
      }),
    }
  )
  // Chamado quando o usuário corrige uma sugestão na revisão da importação.
  .post(
    "/feedback",
    async ({ body, status }) => {
      const result = await service.feedback(body)
      if ("conflictRuleId" in result) return status(409, result)
      if ("message" in result) return status(400, result)
      return result
    },
    {
      body: t.Object({
        description: t.String({ minLength: 1 }),
        categoryId: t.Optional(t.Nullable(t.String())),
        paymentMethod: t.Optional(t.Nullable(paymentMethodUnion)),
        recurrence: t.Optional(t.Nullable(recurrenceUnion)),
        isEssential: t.Optional(t.Nullable(t.Boolean())),
        renameTo: t.Optional(t.Nullable(t.String())),
        budgetId: t.Optional(t.Nullable(t.String())),
        createRule: t.Optional(t.Boolean()),
      }),
    }
  )
  .get(
    "/rules",
    ({ query }) =>
      service.listRules({
        search: query.search,
        source: query.source as RuleSource | undefined,
        enabled:
          query.enabled === undefined ? undefined : query.enabled === "true",
      }),
    {
      query: t.Object({
        search: t.Optional(t.String()),
        source: t.Optional(t.String()),
        enabled: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/rules",
    async ({ body, status }) => {
      const result = await service.createRule(body)
      if ("message" in result) return status(400, result)
      return result
    },
    { body: ruleBody }
  )
  .put(
    "/rules/:id",
    async ({ params, body, status }) => {
      const result = await service.updateRule(params.id, body)
      if (!result) return status(404, { message: "Regra não encontrada" })
      if ("message" in result) return status(400, result)
      return result
    },
    { body: ruleBody }
  )
  .patch("/rules/:id/toggle", async ({ params, status }) => {
    const updated = await service.toggleRule(params.id)
    return updated ?? status(404, { message: "Regra não encontrada" })
  })
  .delete("/rules/:id", async ({ params, status }) => {
    const ok = await service.deleteRule(params.id)
    return ok ? { success: true } : status(404, { message: "Regra não encontrada" })
  })
  // Preview antes de salvar: mostra o que a regra casaria no histórico.
  .post(
    "/rules/test",
    async ({ body, status }) => {
      const result = await service.testRule(
        body.pattern,
        (body.matchType ?? "contains") as RuleMatchType
      )
      if ("message" in result) return status(400, result)
      return result
    },
    {
      body: t.Object({
        pattern: t.String(),
        matchType: t.Optional(matchTypeUnion),
      }),
    }
  )

export const recurringRoute = new Elysia({ prefix: "/recurring" })
  .get(
    "/",
    ({ query }) =>
      service.listRecurring({
        walletId: query.walletId || null,
        status: query.status as RecurringStatus | undefined,
        includeDismissed: query.includeDismissed === "true",
      }),
    {
      query: t.Object({
        walletId: t.Optional(t.String()),
        status: t.Optional(t.String()),
        includeDismissed: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/recalculate",
    ({ body }) => service.recalculate(body?.walletId ?? null),
    {
      body: t.Optional(
        t.Object({ walletId: t.Optional(t.Nullable(t.String())) })
      ),
    }
  )
  .patch("/:id/dismiss", async ({ params, status }) => {
    const updated = await service.dismissRecurring(params.id)
    return updated ?? status(404, { message: "Série não encontrada" })
  })
  .get("/:id/transactions", async ({ params, status }) => {
    const result = await service.recurringTransactions(params.id)
    return result ?? status(404, { message: "Série não encontrada" })
  })
