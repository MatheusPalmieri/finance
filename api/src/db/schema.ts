import { relations, sql } from "drizzle-orm"
import {
  boolean,
  date,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

export const accountTypeEnum = pgEnum("account_type", [
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "INVESTMENT",
  "CASH",
  "OTHER",
])

// Recorrência do gasto: fixo (recorrente) ou variável (pontual)
export const recurrenceEnum = pgEnum("recurrence", ["fixed", "variable"])

// Tipo de orçamento pela regra 50/30/20
export const budgetTypeEnum = pgEnum("budget_type", [
  "essential",
  "desire",
  "investment",
])

// Forma do valor do orçamento: fixo ou faixa (mín–máx)
export const budgetAmountTypeEnum = pgEnum("budget_amount_type", [
  "fixed",
  "variable",
])

// Movimento do investimento: aporte (entra) ou retirada (sai)
export const investmentMovementTypeEnum = pgEnum("investment_movement_type", [
  "deposit", // Aporte — soma ao current_amount
  "withdrawal", // Retirada — subtrai do current_amount
])

// Tipo do investimento — extensível no futuro; foco atual em stock e cdi
export const investmentTypeEnum = pgEnum("investment_type", [
  "stock", // Ações
  "cdi", // CDI (CDB, LCI, LCA atrelados ao CDI)
  "fii", // Fundo Imobiliário
  "treasury", // Tesouro Direto
  "crypto", // Criptomoedas
  "fund", // Fundo de Investimento
])

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: accountTypeEnum("type").default("CHECKING").notNull(),
  balance: numeric("balance", { precision: 12, scale: 2 }).default("0").notNull(),
  color: varchar("color", { length: 7 }).default("#6366f1").notNull(),
  icon: varchar("icon", { length: 50 }).default("wallet").notNull(),
  // Conta padrão pré-selecionada no formulário de transação (apenas uma por vez)
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).default("#6366f1").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).default("#6366f1").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const banks = pgTable("banks", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).default("#6366f1").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  categoryId: uuid("category_id")
    .references(() => categories.id)
    .notNull(),
  paymentMethodId: uuid("payment_method_id")
    .references(() => paymentMethods.id)
    .notNull(),
  accountId: uuid("account_id")
    .references(() => accounts.id)
    .notNull(),
  isEssential: boolean("is_essential").default(false).notNull(),
  recurrence: recurrenceEnum("recurrence").notNull(),
  // Obrigatório quando recurrence = 'fixed' (validado na rota); nulo se 'variable'
  budgetId: uuid("budget_id").references(() => budgets.id),
  date: date("date").default(sql`CURRENT_DATE`).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})

export const budgets = pgTable("budgets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: budgetTypeEnum("type").notNull(),
  amountType: budgetAmountTypeEnum("amount_type").notNull(),
  // Preenchido conforme amountType (validado na rota):
  // fixed → amount; variable → amountMin/amountMax
  amount: numeric("amount", { precision: 10, scale: 2 }),
  amountMin: numeric("amount_min", { precision: 10, scale: 2 }),
  amountMax: numeric("amount_max", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})

export const investments = pgTable("investments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: investmentTypeEnum("type").notNull(),
  // Valor atual — atualizado SOMENTE via aportes (nunca por PUT ou transações).
  // Cada aporte é somado a este valor; ao remover um aporte, é subtraído.
  currentAmount: numeric("current_amount", { precision: 10, scale: 2 })
    .default("0")
    .notNull(),
  goalAmount: numeric("goal_amount", { precision: 10, scale: 2 }),
  monthlyContribution: numeric("monthly_contribution", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})

export const investmentContributions = pgTable("investment_contributions", {
  id: uuid("id").defaultRandom().primaryKey(),
  investmentId: uuid("investment_id")
    .references(() => investments.id, { onDelete: "cascade" })
    .notNull(),
  // deposit soma ao current_amount; withdrawal subtrai
  type: investmentMovementTypeEnum("type").default("deposit").notNull(),
  // Valor do movimento (sempre positivo); o sinal vem do `type`
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: date("date").default(sql`CURRENT_DATE`).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ── Relations ────────────────────────────────────────────────────────────────
export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
}))

export const categoriesRelations = relations(categories, ({ many }) => ({
  transactions: many(transactions),
}))

export const paymentMethodsRelations = relations(paymentMethods, ({ many }) => ({
  transactions: many(transactions),
}))

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  paymentMethod: one(paymentMethods, {
    fields: [transactions.paymentMethodId],
    references: [paymentMethods.id],
  }),
  budget: one(budgets, {
    fields: [transactions.budgetId],
    references: [budgets.id],
  }),
}))

export const budgetsRelations = relations(budgets, ({ many }) => ({
  transactions: many(transactions),
}))

export const investmentsRelations = relations(investments, ({ many }) => ({
  contributions: many(investmentContributions),
}))

export const investmentContributionsRelations = relations(
  investmentContributions,
  ({ one }) => ({
    investment: one(investments, {
      fields: [investmentContributions.investmentId],
      references: [investments.id],
    }),
  })
)

// ── Types ─────────────────────────────────────────────────────────────────────
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type AccountType = (typeof accountTypeEnum.enumValues)[number]

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert

export type PaymentMethod = typeof paymentMethods.$inferSelect
export type NewPaymentMethod = typeof paymentMethods.$inferInsert

export type Bank = typeof banks.$inferSelect
export type NewBank = typeof banks.$inferInsert

export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type Recurrence = (typeof recurrenceEnum.enumValues)[number]

export type Budget = typeof budgets.$inferSelect
export type NewBudget = typeof budgets.$inferInsert
export type BudgetType = (typeof budgetTypeEnum.enumValues)[number]
export type BudgetAmountType = (typeof budgetAmountTypeEnum.enumValues)[number]

export type Investment = typeof investments.$inferSelect
export type NewInvestment = typeof investments.$inferInsert
export type InvestmentType = (typeof investmentTypeEnum.enumValues)[number]

export type InvestmentContribution = typeof investmentContributions.$inferSelect
export type NewInvestmentContribution = typeof investmentContributions.$inferInsert
export type InvestmentMovementType =
  (typeof investmentMovementTypeEnum.enumValues)[number]
