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

// Agrupamento livre e opcional para transações (ex: "Carteira Pessoal", "Carteira Empresa")
// — independente de `accounts` (que representa banco/tipo de conta com saldo)
export const wallets = pgTable("wallets", {
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
  // Opcional — agrupamento livre, ver `wallets`
  walletId: uuid("wallet_id").references(() => wallets.id),
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
    walletId: uuid("wallet_id").references(() => wallets.id, {
      onDelete: "cascade",
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
    // `wallet_id` é nullable e NULL não colide em unique — por isso o índice
    // usa coalesce com o UUID zero para tratar "sem carteira" como um valor.
    uniqueIndex("recurring_series_merchant_wallet_uq").on(
      table.merchantKey,
      sql`coalesce(${table.walletId}, '00000000-0000-0000-0000-000000000000'::uuid)`
    ),
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
    walletId: uuid("wallet_id").references(() => wallets.id, {
      onDelete: "cascade",
    }),
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
    uniqueIndex("monthly_reports_period_wallet_uq").on(
      table.month,
      table.year,
      sql`coalesce(${table.walletId}, '00000000-0000-0000-0000-000000000000'::uuid)`
    ),
  ]
)

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

// ── Open Finance (somente leitura) ───────────────────────────────────────────
// Módulo isolado: contas/transações externas vivem em tabelas próprias e NÃO
// são inseridas em `transactions`. As manuais e as de CSV continuam intactas.

export const ofConnectionStatusEnum = pgEnum("of_connection_status", [
  "PENDING", // aguardando conclusão no provedor / widget
  "UPDATING", // sincronização em andamento no provedor
  "ACTIVE", // conectada e atualizada
  "LOGIN_ERROR", // credenciais inválidas ou MFA pendente no provedor
  "ERROR", // erro genérico do provedor
  "DELETED", // desconectada
])

export const ofSyncStatusEnum = pgEnum("of_sync_status", [
  "RUNNING",
  "SUCCESS",
  "ERROR",
])

export const ofSyncTriggerEnum = pgEnum("of_sync_trigger", [
  "INITIAL",
  "MANUAL",
  "WEBHOOK",
])

// Direção preservada da origem — nunca convertida em "despesa" automaticamente
export const ofTxDirectionEnum = pgEnum("of_tx_direction", ["INFLOW", "OUTFLOW"])

export const openFinanceConnections = pgTable("open_finance_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Reservado para multiusuário futuro — hoje sempre null (ver CLAUDE.md)
  userId: uuid("user_id"),
  provider: varchar("provider", { length: 30 }).notNull(), // pluggy | belvo | mock
  // Identificador da conexão ("item") no provedor — chave de idempotência
  providerItemId: varchar("provider_item_id", { length: 255 }).notNull().unique(),
  connectorId: varchar("connector_id", { length: 60 }),
  connectorName: varchar("connector_name", { length: 255 }),
  status: ofConnectionStatusEnum("status").default("PENDING").notNull(),
  statusDetail: text("status_detail"),
  lastSyncedAt: timestamp("last_synced_at"),
  // Metadados do item vindos do provedor — nunca contém credenciais
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})

export const openFinanceAccounts = pgTable("open_finance_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectionId: uuid("connection_id")
    .references(() => openFinanceConnections.id, { onDelete: "cascade" })
    .notNull(),
  providerAccountId: varchar("provider_account_id", { length: 255 })
    .notNull()
    .unique(),
  // Vínculo opcional com uma conta interna — nunca criado automaticamente
  linkedAccountId: uuid("linked_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  type: varchar("type", { length: 40 }),
  name: varchar("name", { length: 255 }),
  // Número mascarado quando o provedor fornece — nunca o número completo
  number: varchar("number", { length: 60 }),
  balance: numeric("balance", { precision: 14, scale: 2 }),
  currencyCode: varchar("currency_code", { length: 3 }).default("BRL"),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})

export const openFinanceTransactions = pgTable("open_finance_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectionId: uuid("connection_id")
    .references(() => openFinanceConnections.id, { onDelete: "cascade" })
    .notNull(),
  ofAccountId: uuid("of_account_id")
    .references(() => openFinanceAccounts.id, { onDelete: "cascade" })
    .notNull(),
  // Identificador original no provedor — chave de idempotência da importação
  providerTransactionId: varchar("provider_transaction_id", { length: 255 })
    .notNull()
    .unique(),
  description: varchar("description", { length: 500 }).notNull(),
  // Valor normalizado para o modelo do projeto:
  // positivo = saída (despesa), negativo = entrada. Ver docs/open-finance.
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).default("BRL"),
  date: date("date").notNull(),
  direction: ofTxDirectionEnum("direction").notNull(),
  // Status preservado da origem (ex.: Pluggy POSTED | PENDING)
  status: varchar("status", { length: 30 }),
  category: varchar("category", { length: 120 }),
  // Payload cru do provedor — auditoria e reprocessamento
  rawPayload: jsonb("raw_payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})

export const openFinanceSyncRuns = pgTable("open_finance_sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectionId: uuid("connection_id")
    .references(() => openFinanceConnections.id, { onDelete: "cascade" })
    .notNull(),
  status: ofSyncStatusEnum("status").default("RUNNING").notNull(),
  trigger: ofSyncTriggerEnum("trigger").notNull(),
  accountsSynced: integer("accounts_synced").default(0).notNull(),
  transactionsCreated: integer("transactions_created").default(0).notNull(),
  transactionsUpdated: integer("transactions_updated").default(0).notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
})

// ── Relations ────────────────────────────────────────────────────────────────
export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
}))

export const categoriesRelations = relations(categories, ({ many }) => ({
  transactions: many(transactions),
}))

export const walletsRelations = relations(wallets, ({ many }) => ({
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
  wallet: one(wallets, {
    fields: [transactions.walletId],
    references: [wallets.id],
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
    wallet: one(wallets, {
      fields: [recurringSeries.walletId],
      references: [wallets.id],
    }),
  })
)

export const monthlyReportsRelations = relations(monthlyReports, ({ one }) => ({
  wallet: one(wallets, {
    fields: [monthlyReports.walletId],
    references: [wallets.id],
  }),
}))

export const openFinanceConnectionsRelations = relations(
  openFinanceConnections,
  ({ many }) => ({
    accounts: many(openFinanceAccounts),
    transactions: many(openFinanceTransactions),
    syncRuns: many(openFinanceSyncRuns),
  })
)

export const openFinanceAccountsRelations = relations(
  openFinanceAccounts,
  ({ one, many }) => ({
    connection: one(openFinanceConnections, {
      fields: [openFinanceAccounts.connectionId],
      references: [openFinanceConnections.id],
    }),
    linkedAccount: one(accounts, {
      fields: [openFinanceAccounts.linkedAccountId],
      references: [accounts.id],
    }),
    transactions: many(openFinanceTransactions),
  })
)

export const openFinanceTransactionsRelations = relations(
  openFinanceTransactions,
  ({ one }) => ({
    connection: one(openFinanceConnections, {
      fields: [openFinanceTransactions.connectionId],
      references: [openFinanceConnections.id],
    }),
    ofAccount: one(openFinanceAccounts, {
      fields: [openFinanceTransactions.ofAccountId],
      references: [openFinanceAccounts.id],
    }),
  })
)

export const openFinanceSyncRunsRelations = relations(
  openFinanceSyncRuns,
  ({ one }) => ({
    connection: one(openFinanceConnections, {
      fields: [openFinanceSyncRuns.connectionId],
      references: [openFinanceConnections.id],
    }),
  })
)

// ── Types ─────────────────────────────────────────────────────────────────────
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type AccountType = (typeof accountTypeEnum.enumValues)[number]

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert

export type Wallet = typeof wallets.$inferSelect
export type NewWallet = typeof wallets.$inferInsert

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

export type OpenFinanceConnection = typeof openFinanceConnections.$inferSelect
export type NewOpenFinanceConnection = typeof openFinanceConnections.$inferInsert
export type OfConnectionStatus =
  (typeof ofConnectionStatusEnum.enumValues)[number]

export type OpenFinanceAccount = typeof openFinanceAccounts.$inferSelect
export type NewOpenFinanceAccount = typeof openFinanceAccounts.$inferInsert

export type OpenFinanceTransaction = typeof openFinanceTransactions.$inferSelect
export type NewOpenFinanceTransaction =
  typeof openFinanceTransactions.$inferInsert
export type OfTxDirection = (typeof ofTxDirectionEnum.enumValues)[number]

export type OpenFinanceSyncRun = typeof openFinanceSyncRuns.$inferSelect
export type NewOpenFinanceSyncRun = typeof openFinanceSyncRuns.$inferInsert
export type OfSyncStatus = (typeof ofSyncStatusEnum.enumValues)[number]
export type OfSyncTrigger = (typeof ofSyncTriggerEnum.enumValues)[number]
