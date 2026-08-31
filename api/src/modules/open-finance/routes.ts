import { Elysia, t } from "elysia"
import * as service from "./service"
import { log } from "./log"

// Valida o webhook por segredo compartilhado, se configurado.
function webhookAuthorized(headers: Record<string, string | undefined>, query: Record<string, string | undefined>): boolean {
  const expected = process.env.OPEN_FINANCE_WEBHOOK_SECRET
  if (!expected) return true
  const provided = headers["x-webhook-secret"] ?? query.secret
  return provided === expected
}

export const openFinanceRoute = new Elysia({ prefix: "/open-finance" })
  // Registra uma conexão (via itemId do widget ou connectorId de sandbox) e
  // dispara a sincronização inicial.
  .post(
    "/connections",
    async ({ body }) => service.createConnection(body),
    {
      body: t.Object({
        itemId: t.Optional(t.String()),
        connectorId: t.Optional(t.String()),
        parameters: t.Optional(t.Record(t.String(), t.String())),
      }),
    }
  )
  .get("/connections", () => service.listConnections())
  .delete("/connections/:id", async ({ params, status }) => {
    const ok = await service.deleteConnection(params.id)
    return ok ? { success: true } : status(404, { message: "Conexão não encontrada" })
  })
  .post("/connections/:id/sync", async ({ params, status }) => {
    const run = await service.syncConnection(params.id, "MANUAL")
    return run ?? status(404, { message: "Conexão não encontrada" })
  })
  .get(
    "/connections/:id/transactions",
    async ({ params, query, status }) => {
      const result = await service.listConnectionTransactions(params.id, {
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
        from: query.from,
        to: query.to,
      })
      return result ?? status(404, { message: "Conexão não encontrada" })
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    }
  )
  // Webhook do provedor — responde 200 rápido; a sincronização roda em background.
  .post("/webhooks", async ({ body, headers, query, status }) => {
    if (!webhookAuthorized(headers, query)) {
      log.error("webhook rejeitado: segredo inválido")
      return status(401, { message: "Não autorizado" })
    }
    return service.handleWebhook(body)
  })
