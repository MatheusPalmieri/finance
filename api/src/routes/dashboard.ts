import { Elysia, t } from "elysia"
import { and, between, eq, desc, lte, sql } from "drizzle-orm"
import { db } from "../db"
import { accounts, categories, transactions } from "../db/schema"
import { PAYMENT_METHOD_HEX, PAYMENT_METHOD_LABELS } from "../lib/payment-methods"
import { FALLBACK_CATEGORY } from "../lib/fallback-category"
import { COUNTED_TRANSACTIONS, REAL_TRANSACTIONS } from "../lib/scope"

// Valor negativo = entrada (ver routes/transactions.ts). Este painel é só de
// despesas, então as agregações abaixo ignoram entradas.
const isExpense = sql`amount::numeric > 0`

// Transação que caiu na categoria de reserva do sync
const unclassified = sql`lower(${categories.name}) = ${FALLBACK_CATEGORY.toLowerCase()}`

// Data de hoje no fuso do usuário (YYYY-MM-DD); `sv-SE` formata como ISO
function todayInSaoPaulo() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  })
}

export const dashboardRoute = new Elysia({ prefix: "/dashboard" })
  .get(
    "/summary",
    async ({ query }) => {
      const now = new Date()
      const month = Number(query.month) || now.getMonth() + 1
      const year = Number(query.year) || now.getFullYear()

      const firstDay = `${year}-${String(month).padStart(2, "0")}-01`
      const lastDay = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`

      // Fora do painel: movimentos internos (fatura, aplicação, transferência
      // entre contas próprias)
      const inMonth = and(
        between(transactions.date, firstDay, lastDay),
        isExpense,
        COUNTED_TRANSACTIONS
      )

      // Totais do mês (despesas), com cortes por essencial e por recorrência
      const [totals] = await db
        .select({
          total: sql<string>`coalesce(sum(amount::numeric), 0)`,
          // Na categoria de reserva do sync = ainda sem classificação: ele grava
          // `is_essential = false` por padrão, então contar isso como "não
          // essencial" seria inventar dado. Fica num balde próprio.
          essential: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.isEssential} and not ${unclassified}), 0)`,
          nonEssential: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where not ${transactions.isEssential} and not ${unclassified}), 0)`,
          unclassified: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${unclassified}), 0)`,
          unclassifiedCount: sql<number>`(count(*) filter (where ${unclassified}))::int`,
          fixed: sql<string>`coalesce(sum(amount::numeric) filter (where recurrence = 'fixed'), 0)`,
          variable: sql<string>`coalesce(sum(amount::numeric) filter (where recurrence = 'variable'), 0)`,
          transactionCount: sql<number>`count(*)::int`,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
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

      // Despesas por forma de pagamento — lista fixa, sem join (não é mais tabela)
      const expensesByPaymentMethod = await db
        .select({
          paymentMethod: transactions.paymentMethod,
          amount: sql<string>`sum(amount::numeric)`,
        })
        .from(transactions)
        .where(inMonth)
        .groupBy(transactions.paymentMethod)
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
          AND ${COUNTED_TRANSACTIONS}
        GROUP BY TO_CHAR(date::date, 'YYYY-MM')
        ORDER BY month
      `)

      // Ritmo: total do mês anterior até o mesmo dia, para comparar com o mês
      // em curso sem que o mês parcial pareça "menos gasto". Mês já fechado
      // compara com o mês anterior inteiro
      const today = todayInSaoPaulo()
      const isCurrentMonth = today.startsWith(
        `${year}-${String(month).padStart(2, "0")}`
      )
      const cutoffDay = isCurrentMonth
        ? Number(today.slice(8, 10))
        : new Date(year, month, 0).getDate()
      const prevYear = month === 1 ? year - 1 : year
      const prevMonth = month === 1 ? 12 : month - 1
      const prevPrefix = `${prevYear}-${String(prevMonth).padStart(2, "0")}`
      const prevLastDay = new Date(prevYear, prevMonth, 0).getDate()
      const [previous] = await db
        .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
        .from(transactions)
        .where(
          and(
            between(
              transactions.date,
              `${prevPrefix}-01`,
              `${prevPrefix}-${String(Math.min(cutoffDay, prevLastDay)).padStart(2, "0")}`
            ),
            isExpense,
            COUNTED_TRANSACTIONS
          )
        )

      // Transações recentes. Só até hoje: parcelas futuras do cartão já vêm
      // lançadas com data adiante e não são "recentes"
      const recentTransactions = await db.query.transactions.findMany({
        where: and(REAL_TRANSACTIONS, lte(transactions.date, today)),
        with: { account: true, category: true, budget: true },
        orderBy: [desc(transactions.date), desc(transactions.createdAt)],
        limit: 6,
      })

      return {
        totalExpenses: String(totals?.total ?? 0),
        essentialExpenses: String(totals?.essential ?? 0),
        nonEssentialExpenses: String(totals?.nonEssential ?? 0),
        unclassifiedExpenses: String(totals?.unclassified ?? 0),
        unclassifiedCount: Number(totals?.unclassifiedCount ?? 0),
        pace: {
          previousTotal: String(previous?.total ?? 0),
          cutoffDay,
          partial: isCurrentMonth,
        },
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
          id: r.paymentMethod,
          name: PAYMENT_METHOD_LABELS[r.paymentMethod],
          color: PAYMENT_METHOD_HEX[r.paymentMethod],
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
