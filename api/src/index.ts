import { cors } from "@elysiajs/cors"
import { Elysia } from "elysia"
import { accountsRoute } from "./routes/accounts"
import { budgetsRoute } from "./routes/budgets"
import { categoriesRoute } from "./routes/categories"
import { dashboardRoute } from "./routes/dashboard"
import { transactionsRoute } from "./routes/transactions"

const app = new Elysia()
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
  .use(transactionsRoute)
  .use(budgetsRoute)
  .use(dashboardRoute)
  .listen(3001)

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`)
