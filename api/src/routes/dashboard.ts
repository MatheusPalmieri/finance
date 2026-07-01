import { Elysia, t } from "elysia"
import { and, between, desc, eq, sql } from "drizzle-orm"
import { db } from "../db"
import { accounts, categories, paymentMethods, transactions } from "../db/schema"

// Valor negativo = entrada (ver routes/transactions.ts). Este painel é só de
// despesas, então as agregações abaixo ignoram entradas.
const isExpense = sql`amount::numeric > 0`

export const dashboardRoute = new Elysia({ prefix: "/dashboard" })
  .get(
    "/summary",
    async ({ query }) => {
      const now = new Date()
      const month = Number(query.month) || now.getMonth() + 1
      const year = Number(query.year) || now.getFullYear()

      const firstDay = `${year}-${String(month).padStart(2, "0")}-01`
      const lastDay = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`
      const inMonth = and(between(transactions.date, firstDay, lastDay), isExpense)

      // Totais do mês (despesas), com cortes por essencial e por recorrência
      const [totals] = await db
        .select({
          total: sql<string>`coalesce(sum(amount::numeric), 0)`,
          essential: sql<string>`coalesce(sum(amount::numeric) filter (where is_essential), 0)`,
          nonEssential: sql<string>`coalesce(sum(amount::numeric) filter (where not is_essential), 0)`,
          fixed: sql<string>`coalesce(sum(amount::numeric) filter (where recurrence = 'fixed'), 0)`,
          variable: sql<string>`coalesce(sum(amount::numeric) filter (where recurrence = 'variable'), 0)`,
          transactionCount: sql<number>`count(*)::int`,
        })
        .from(transactions)
        .where(inMonth)

      // Despesas por categoria
      const expensesByCategory = await db
        .select({
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          color: categories.color,
          amount: sql<string>`sum(amount::numeric)`,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(inMonth)
        .groupBy(transactions.categoryId, categories.name, categories.color)
        .orderBy(sql`sum(amount::numeric) desc`)

      // Despesas por forma de pagamento
      const expensesByPaymentMethod = await db
        .select({
          id: transactions.paymentMethodId,
          name: paymentMethods.name,
          color: paymentMethods.color,
          amount: sql<string>`sum(amount::numeric)`,
        })
        .from(transactions)
        .leftJoin(paymentMethods, eq(transactions.paymentMethodId, paymentMethods.id))
        .where(inMonth)
        .groupBy(transactions.paymentMethodId, paymentMethods.name, paymentMethods.color)
        .orderBy(sql`sum(amount::numeric) desc`)

      // Despesas por conta
      const expensesByAccount = await db
        .select({
          id: transactions.accountId,
          name: accounts.name,
          color: accounts.color,
          amount: sql<string>`sum(amount::numeric)`,
        })
        .from(transactions)
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(inMonth)
        .groupBy(transactions.accountId, accounts.name, accounts.color)
        .orderBy(sql`sum(amount::numeric) desc`)

      // Tendência de despesas dos últimos 6 meses
      const trendRows = await db.execute<{ month: string; total: string }>(sql`
        SELECT
          TO_CHAR(date::date, 'YYYY-MM') as month,
          SUM(amount::numeric) as total
        FROM transactions
        WHERE date >= (${firstDay}::date - INTERVAL '5 months')
          AND date <= ${lastDay}::date
          AND amount::numeric > 0
        GROUP BY TO_CHAR(date::date, 'YYYY-MM')
        ORDER BY month
      `)

      // Transações recentes
      const recentTransactions = await db.query.transactions.findMany({
        with: { account: true, category: true, paymentMethod: true, budget: true },
        orderBy: [desc(transactions.date), desc(transactions.createdAt)],
        limit: 10,
      })

      return {
        totalExpenses: String(totals?.total ?? 0),
        essentialExpenses: String(totals?.essential ?? 0),
        nonEssentialExpenses: String(totals?.nonEssential ?? 0),
        fixedExpenses: String(totals?.fixed ?? 0),
        variableExpenses: String(totals?.variable ?? 0),
        transactionCount: Number(totals?.transactionCount ?? 0),
        expensesByCategory: expensesByCategory.map((r) => ({
          categoryId: r.categoryId,
          categoryName: r.categoryName ?? "Sem categoria",
          color: r.color ?? "#6b7280",
          amount: r.amount,
        })),
        expensesByPaymentMethod: expensesByPaymentMethod.map((r) => ({
          id: r.id,
          name: r.name ?? "—",
          color: r.color ?? "#6b7280",
          amount: r.amount,
        })),
        expensesByAccount: expensesByAccount.map((r) => ({
          id: r.id,
          name: r.name ?? "—",
          color: r.color ?? "#6b7280",
          amount: r.amount,
        })),
        monthlyTrend: trendRows.map((r) => ({
          month: r.month,
          total: Number(r.total),
        })),
        recentTransactions,
      }
    },
    {
      query: t.Object({
        month: t.Optional(t.String()),
        year: t.Optional(t.String()),
      }),
    }
  )
