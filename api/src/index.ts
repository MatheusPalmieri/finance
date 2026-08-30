import { cors } from "@elysiajs/cors"
import { Elysia } from "elysia"
import { accountsRoute } from "./routes/accounts"
import { budgetsRoute } from "./routes/budgets"
import { categoriesRoute } from "./routes/categories"
import { dashboardRoute } from "./routes/dashboard"
import { transactionsRoute } from "./routes/transactions"

const app = new Elysia()
  .use(cors({ origin: "http://localhost:5173" }))
  .use(accountsRoute)
  .use(categoriesRoute)
  .use(transactionsRoute)
  .use(budgetsRoute)
  .use(dashboardRoute)
  .listen(3001)

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`)
