import { Elysia, t } from "elysia"
import { db } from "../../db"
import { categories } from "../../db/schema"
import { parseScenario } from "./parse"
import * as service from "./service"
import type { ScenarioEvent } from "./types"

const scenarioEvent = t.Union([
  t.Object({
    kind: t.Literal("installment_purchase"),
    label: t.String(),
    totalAmount: t.Number(),
    installments: t.Number(),
    monthlyInterestPct: t.Optional(t.Number()),
    startMonth: t.Optional(t.Nullable(t.String())),
    categoryId: t.Optional(t.Nullable(t.String())),
  }),
  t.Object({
    kind: t.Literal("recurring_change"),
    label: t.String(),
    monthlyAmount: t.Number(),
    startMonth: t.Optional(t.Nullable(t.String())),
    endMonth: t.Optional(t.Nullable(t.String())),
    categoryId: t.Optional(t.Nullable(t.String())),
  }),
  t.Object({
    kind: t.Literal("one_off"),
    label: t.String(),
    amount: t.Number(),
    month: t.String(),
  }),
  t.Object({
    kind: t.Literal("income_change"),
    label: t.String(),
    monthlyAmount: t.Number(),
    startMonth: t.Optional(t.Nullable(t.String())),
  }),
])

export const forecastRoute = new Elysia({ prefix: "/forecast" })
  .get(
    "/cashflow",
    ({ query }) =>
      service.cashflow(
        query.walletId || null,
        query.horizonMonths ? Number(query.horizonMonths) : undefined
      ),
    {
      query: t.Object({
        walletId: t.Optional(t.String()),
        horizonMonths: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/simulate",
    ({ body }) =>
      service.simulateScenario(
        body.walletId ?? null,
        body.events as ScenarioEvent[],
        body.horizonMonths
      ),
    {
      body: t.Object({
        walletId: t.Optional(t.Nullable(t.String())),
        horizonMonths: t.Optional(t.Number()),
        events: t.Array(scenarioEvent),
      }),
    }
  )
  .post(
    "/afford",
    async ({ body, status }) => {
      if (!(body.totalAmount > 0)) {
        return status(400, { message: "Informe um valor maior que zero" })
      }
      return service.afford({
        walletId: body.walletId ?? null,
        totalAmount: body.totalAmount,
        installments: body.installments,
        monthlyInterestPct: body.monthlyInterestPct,
        label: body.label,
        categoryId: body.categoryId ?? null,
        horizonMonths: body.horizonMonths,
      })
    },
    {
      body: t.Object({
        walletId: t.Optional(t.Nullable(t.String())),
        totalAmount: t.Number(),
        installments: t.Optional(t.Number()),
        monthlyInterestPct: t.Optional(t.Number()),
        label: t.Optional(t.String()),
        categoryId: t.Optional(t.Nullable(t.String())),
        horizonMonths: t.Optional(t.Number()),
      }),
    }
  )
  // Único ponto de IA: a resposta pré-preenche o formulário, nunca é aplicada
  // direto. Nunca responde 500 por causa do provedor.
  .post(
    "/parse",
    async ({ body }) => {
      const catalog = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
      return parseScenario(body.text, {
        today: new Date().toISOString().slice(0, 10),
        categories: catalog,
      })
    },
    { body: t.Object({ text: t.String({ minLength: 1 }) }) }
  )

export const settingsRoute = new Elysia({ prefix: "/settings" })
  .get("/", () => service.getSettings())
  .put(
    "/",
    ({ body }) =>
      service.updateSettings({
        minimumReserveBrl: body.minimumReserveBrl,
        defaultHorizonMonths: body.defaultHorizonMonths,
      }),
    {
      body: t.Object({
        minimumReserveBrl: t.Optional(t.Nullable(t.Number())),
        defaultHorizonMonths: t.Optional(t.Number({ minimum: 1, maximum: 12 })),
      }),
    }
  )
