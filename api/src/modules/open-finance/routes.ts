import { Elysia, t } from "elysia"
import { getBalances } from "./balances"
import { getInvestments } from "./investments"
import { isConfigured } from "./provider"
import * as service from "./service"
import { runSync, SyncBusyError } from "./sync"

const NOT_CONFIGURED =
  "Open Finance não configurado — defina PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_ITEM_IDS no api/.env"

export const openFinanceRoute = new Elysia({ prefix: "/open-finance" })
  // Chamado pelo app ao abrir: com dados velhos (> 6h), já dispara o sync
  .get("/status", ({ query }) =>
    service.getStatus({ triggerIfStale: query.autoSync !== "false" })
  , { query: t.Object({ autoSync: t.Optional(t.String()) }) })
  .post(
    "/sync",
    async ({ body, status }) => {
      if (!isConfigured()) return status(400, { message: NOT_CONFIGURED })
      const opts = {
        trigger: "manual" as const,
        full: body?.full,
        refresh: body?.refresh,
      }
      // Simulação espera o resultado: é o relatório que interessa
      if (body?.dryRun) {
        try {
          return await runSync({ ...opts, dryRun: true })
        } catch (err) {
          if (err instanceof SyncBusyError) return status(409, { message: err.message })
          throw err
        }
      }
      // O real roda em segundo plano (com `refresh` pode levar ~2 min);
      // a UI acompanha pelo /status
      service.startSync(opts)
      return status(202, { started: true })
    },
    {
      body: t.Optional(
        t.Object({
          full: t.Optional(t.Boolean()),
          refresh: t.Optional(t.Boolean()),
          dryRun: t.Optional(t.Boolean()),
        })
      ),
    }
  )
  // Saldos: último retrato do banco (até 15 min); vencido ou `fresh=true`, busca
  // na Pluggy e grava. Pluggy fora do ar → último retrato com `stale: true`
  .get("/balances", ({ query }) => getBalances({ fresh: query.fresh === "true" }), {
    query: t.Object({ fresh: t.Optional(t.String()) }),
  })
  // Investimentos: mesmo fluxo dos saldos, com prazo de 1h
  .get("/investments", ({ query }) => getInvestments({ fresh: query.fresh === "true" }), {
    query: t.Object({ fresh: t.Optional(t.String()) }),
  })
  .get("/runs", ({ query }) => service.listRuns(query.limit ? Number(query.limit) : 20), {
    query: t.Object({ limit: t.Optional(t.String()) }),
  })
  .patch(
    "/accounts/:id",
    async ({ params, body, status }) => {
      const result = await service.relinkAccount(params.id, body.accountId)
      if (result === null) return status(404, { message: "Conta do Open Finance não encontrada" })
      if ("message" in result) return status(400, result)
      return result
    },
    { body: t.Object({ accountId: t.String({ minLength: 1 }) }) }
  )
