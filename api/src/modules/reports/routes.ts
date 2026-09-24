import { Elysia, t } from "elysia"
import * as service from "./service"

export const reportsRoute = new Elysia({ prefix: "/reports" })
  .post(
    "/monthly/generate",
    ({ body }) =>
      service.generate({
        month: body.month,
        year: body.year,
        narrate: body.narrate,
      }),
    {
      body: t.Object({
        month: t.Number({ minimum: 1, maximum: 12 }),
        year: t.Number({ minimum: 2000, maximum: 2100 }),
        narrate: t.Optional(t.Boolean()),
      }),
    }
  )
  .get("/monthly", () => service.list())
  // Antes de "/monthly/:id" para não ser capturado como id
  .get("/monthly/current", () => service.current())
  // Leitura com cache de 24h: só gera (e chama a IA) se não houver relatório
  // recente do período. O POST /generate é o "Regerar" explícito.
  .get(
    "/monthly/period/:year/:month",
    ({ params }) => service.forPeriod(params.month, params.year),
    {
      params: t.Object({
        year: t.Numeric({ minimum: 2000, maximum: 2100 }),
        month: t.Numeric({ minimum: 1, maximum: 12 }),
      }),
    }
  )
  .get("/monthly/:id", async ({ params, status }) => {
    const report = await service.getById(params.id)
    return report ?? status(404, { message: "Relatório não encontrado" })
  })
  .post("/monthly/:id/narrate", async ({ params, status }) => {
    const result = await service.narrate(params.id)
    if (result === null)
      return status(404, { message: "Relatório não encontrado" })
    if ("message" in result) return status(503, result)
    return result
  })
  .delete("/monthly/:id", async ({ params, status }) => {
    const ok = await service.remove(params.id)
    return ok
      ? { success: true }
      : status(404, { message: "Relatório não encontrado" })
  })
