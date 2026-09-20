// Montagem da aplicação, separada do `listen`.
//
// Os testes e2e exercitam a API por `app.handle(new Request(...))`, sem abrir
// porta nem depender de rede. Por isso a construção mora aqui e o `index.ts`
// só sobe o servidor.

import { cors } from "@elysiajs/cors"
import { Elysia } from "elysia"
import { accountsRoute } from "./routes/accounts"
import { budgetsRoute } from "./routes/budgets"
import { categoriesRoute } from "./routes/categories"
import { walletsRoute } from "./routes/wallets"
import { dashboardRoute } from "./routes/dashboard"
import { transactionsRoute } from "./routes/transactions"
import { openFinanceRoute } from "./modules/open-finance"
import { classificationRoute, recurringRoute } from "./modules/classification"
import { llmRoute } from "./modules/llm"
import { reportsRoute } from "./modules/reports"
import { forecastRoute, settingsRoute } from "./modules/forecast"

export function createApp() {
  return (
    new Elysia()
      .use(cors({ origin: "http://localhost:5173" }))
      // Loga a causa real (ex.: PostgresError) — o Drizzle embrulha em "Failed query"
      // e esconde a mensagem original do banco. Sem isso o 500 chega vazio no front.
      .onError(({ code, error, set }) => {
        // Validação e 404 já têm resposta boa do próprio Elysia — não mexer
        if (code === "VALIDATION" || code === "NOT_FOUND") return
        const cause = (error as { cause?: unknown }).cause ?? error
        console.error(`[${code}]`, cause)
        set.status = 500
        return {
          message:
            cause instanceof Error ? cause.message : "Erro interno no servidor",
        }
      })
      .use(accountsRoute)
      .use(categoriesRoute)
      .use(walletsRoute)
      .use(transactionsRoute)
      .use(budgetsRoute)
      .use(dashboardRoute)
      .use(openFinanceRoute)
      .use(classificationRoute)
      .use(recurringRoute)
      .use(reportsRoute)
      .use(forecastRoute)
      .use(settingsRoute)
      .use(llmRoute)
  )
}

export type App = ReturnType<typeof createApp>
