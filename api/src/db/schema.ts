import { relations, sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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

// Forma de pagamento — lista fixa do sistema, não é mais CRUD do usuário
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash", // Dinheiro
  "pix", // Pix
  "credit_card", // Cartão de crédito
  "debit_card", // Cartão de débito
  "boleto", // Boleto
  "transfer", // Transferência
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
  // Conta de testes/depuração: suas transações aparecem na listagem, mas ficam
  // fora de toda análise (dashboard, check-up, projeção, classificação)
  isSandbox: boolean("is_sandbox").default(false).notNull(),
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

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  categoryId: uuid("category_id")
    .references(() => categories.id)
    .notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
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

// ── Classificação inteligente (spec 01) ──────────────────────────────────────
// Motor de regras server-side que substitui o de-para hardcoded do frontend.

export const ruleSourceEnum = pgEnum("rule_source", [
  "seed", // migrado do depara.ts original
  "manual", // criado pelo usuário na tela de regras
  "learned", // gerado a partir de uma correção na revisão da importação
])

export const ruleMatchEnum = pgEnum("rule_match", [
  "contains", // substring normalizada — o comportamento histórico do de-para
  "exact", // descrição normalizada idêntica
  "regex", // regex JS, validada na criação
])

export const classificationRules = pgTable(
  "classification_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pattern: varchar("pattern", { length: 255 }).notNull(),
    matchType: ruleMatchEnum("match_type").default("contains").notNull(),
    source: ruleSourceEnum("source").default("manual").notNull(),
    // Quanto maior, antes é avaliada. Regras específicas nascem com prioridade
    // alta; as genéricas, baixa. Empate resolve por pattern mais longo primeiro.
    priority: integer("priority").default(100).notNull(),
    // Todos os campos abaixo são opcionais: a regra aplica só o que preencher
    renameTo: varchar("rename_to", { length: 255 }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    paymentMethod: paymentMethodEnum("payment_method"),
    recurrence: recurrenceEnum("recurrence"),
    isEssential: boolean("is_essential"),
    // Força o sinal, ignorando o do extrato (caso "Aplicação RDB")
    forceIncome: boolean("force_income"),
    budgetId: uuid("budget_id").references(() => budgets.id, {
      onDelete: "set null",
    }),
    enabled: boolean("enabled").default(true).notNull(),
    // Telemetria: quantas vezes a regra já casou e quando foi a última
    hitCount: integer("hit_count").default(0).notNull(),
    lastHitAt: timestamp("last_hit_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("classification_rules_pattern_match_uq").on(
      table.pattern,
      table.matchType
    ),
    index("classification_rules_enabled_priority_idx").on(
      table.enabled,
      table.priority.desc()
    ),
  ]
)

export const recurringStatusEnum = pgEnum("recurring_status", [
  "ACTIVE", // cobrada dentro da janela esperada
  "OVERDUE", // passou da janela esperada sem cobrança
  "CANCELLED", // sem cobrança há mais de 2 ciclos — provavelmente encerrada
])

// Cache derivado de `transactions`: pode ser apagada e recalculada a qualquer
// momento. A única exceção é `dismissed`, preservado pelo upsert do recálculo.
export const recurringSeries = pgTable(
  "recurring_series",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Chave normalizada do estabelecimento — agrupa as ocorrências
    merchantKey: varchar("merchant_key", { length: 255 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    // Intervalo típico em dias (30 = mensal, 365 = anual, 7 = semanal)
    intervalDays: integer("interval_days").notNull(),
    occurrences: integer("occurrences").notNull(),
    averageAmount: numeric("average_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    lastAmount: numeric("last_amount", { precision: 10, scale: 2 }).notNull(),
    firstAmount: numeric("first_amount", { precision: 10, scale: 2 }).notNull(),
    firstChargeDate: date("first_charge_date").notNull(),
    lastChargeDate: date("last_charge_date").notNull(),
    expectedNextDate: date("expected_next_date").notNull(),
    status: recurringStatusEnum("status").default("ACTIVE").notNull(),
    // Usuário marcou como "não é assinatura" — nunca mais sugerir
    dismissed: boolean("dismissed").default(false).notNull(),
    detectedAt: timestamp("detected_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("recurring_series_merchant_uq").on(table.merchantKey),
  ]
)

// ── Check-up mensal (spec 02) ────────────────────────────────────────────────

export const reportStatusEnum = pgEnum("report_status", [
  "GENERATED", // números prontos, sem narrativa
  "NARRATED", // com texto da IA
  "NARRATION_FAILED", // números prontos, IA falhou (UI mostra aviso)
])

export const monthlyReports = pgTable(
  "monthly_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    month: integer("month").notNull(), // 1–12
    year: integer("year").notNull(),
    status: reportStatusEnum("status").default("GENERATED").notNull(),
    /** Todas as métricas das seções 1–6, no formato MonthlyReportMetrics */
    metrics: jsonb("metrics").notNull(),
    /** Insight[] da seção 7 */
    insights: jsonb("insights").notNull(),
    /** Markdown curto gerado pelo LLM — null quando não houve narrativa */
    narrative: text("narrative"),
    /** Sugestões acionáveis extraídas da mesma chamada do LLM */
    suggestions: jsonb("suggestions"),
    narrativeProvider: varchar("narrative_provider", { length: 30 }),
    narrativeModel: varchar("narrative_model", { length: 80 }),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("monthly_reports_period_uq").on(table.month, table.year),
  ]
)

// ── Preferências do app (spec 03) ────────────────────────────────────────────
// Singleton: sempre a linha de `id: 1`. A projeção usa a reserva mínima para
// decidir o veredito do "posso comprar?".

export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  /** Nulo = usar o default calculado (1 mês de essenciais medianos). */
  minimumReserveBrl: numeric("minimum_reserve_brl", { precision: 12, scale: 2 }),
  defaultHorizonMonths: integer("default_horizon_months").default(6).notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})

// ── Observabilidade de LLM (spec 00) ─────────────────────────────────────────
// Nunca grava prompt nem resposta: viraria uma cópia sombra do extrato.
// Para depuração, LLM_DEBUG=true loga no stdout apenas.

export const llmCalls = pgTable("llm_calls", {
  id: uuid("id").defaultRandom().primaryKey(),
  // "categorization" | "monthly_report" | "scenario_parse"
  feature: varchar("feature", { length: 40 }).notNull(),
  provider: varchar("provider", { length: 30 }).notNull(),
  model: varchar("model", { length: 80 }).notNull(),
  inputTokens: integer("input_tokens").default(0).notNull(),
  outputTokens: integer("output_tokens").default(0).notNull(),
  estimatedCostBrl: numeric("estimated_cost_brl", { precision: 10, scale: 4 })
    .default("0")
    .notNull(),
  latencyMs: integer("latency_ms").notNull(),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ── Relations ────────────────────────────────────────────────────────────────
export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
}))

export const categoriesRelations = relations(categories, ({ many }) => ({
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
  budget: one(budgets, {
    fields: [transactions.budgetId],
    references: [budgets.id],
  }),
}))

export const budgetsRelations = relations(budgets, ({ many }) => ({
  transactions: many(transactions),
}))

export const classificationRulesRelations = relations(
  classificationRules,
  ({ one }) => ({
    category: one(categories, {
      fields: [classificationRules.categoryId],
      references: [categories.id],
    }),
    budget: one(budgets, {
      fields: [classificationRules.budgetId],
      references: [budgets.id],
    }),
  })
)

export const recurringSeriesRelations = relations(
  recurringSeries,
  ({ one }) => ({
    category: one(categories, {
      fields: [recurringSeries.categoryId],
      references: [categories.id],
    }),
  })
)

// ── Types ─────────────────────────────────────────────────────────────────────
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type AccountType = (typeof accountTypeEnum.enumValues)[number]

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert

export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number]

export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type Recurrence = (typeof recurrenceEnum.enumValues)[number]

export type Budget = typeof budgets.$inferSelect
export type NewBudget = typeof budgets.$inferInsert
export type BudgetType = (typeof budgetTypeEnum.enumValues)[number]
export type BudgetAmountType = (typeof budgetAmountTypeEnum.enumValues)[number]

export type ClassificationRule = typeof classificationRules.$inferSelect
export type NewClassificationRule = typeof classificationRules.$inferInsert
export type RuleSource = (typeof ruleSourceEnum.enumValues)[number]
export type RuleMatchType = (typeof ruleMatchEnum.enumValues)[number]

export type RecurringSeries = typeof recurringSeries.$inferSelect
export type NewRecurringSeries = typeof recurringSeries.$inferInsert
export type RecurringStatus = (typeof recurringStatusEnum.enumValues)[number]

export type MonthlyReport = typeof monthlyReports.$inferSelect
export type NewMonthlyReport = typeof monthlyReports.$inferInsert
export type ReportStatus = (typeof reportStatusEnum.enumValues)[number]

export type LlmCall = typeof llmCalls.$inferSelect
export type NewLlmCall = typeof llmCalls.$inferInsert

export type AppSettings = typeof appSettings.$inferSelect
export type NewAppSettings = typeof appSettings.$inferInsert
