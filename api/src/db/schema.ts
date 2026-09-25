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

// Origem da transação. O Open Finance é a ÚNICA fonte de verdade: não existe
// mais lançamento manual nem importação de extrato (ver
// decisions/open-finance-fonte-unica.md). O enum fica para um eventual segundo
// agregador entrar sem migração de tipo.
export const transactionSourceEnum = pgEnum("transaction_source", [
  "open_finance", // sincronizada da Pluggy
])

// Situação no banco: só o cartão tem pendentes (fatura aberta e parcelas futuras)
export const transactionStatusEnum = pgEnum("transaction_status", [
  "posted",
  "pending",
])

// Natureza do movimento. Só `regular` entra nas análises: os demais são
// dinheiro mudando de lugar entre contas do próprio usuário — contá-los faria
// a fatura (já detalhada no cartão) ou uma aplicação parecer gasto/renda.
export const transactionKindEnum = pgEnum("transaction_kind", [
  "regular", // gasto ou entrada de verdade
  "bill_payment", // pagamento da fatura (na conta) e o "pagamento recebido" (no cartão)
  "investment", // aplicação/resgate e compra/venda de ativos
  "own_transfer", // transferência entre contas do mesmo titular
])

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: accountTypeEnum("type").default("CHECKING").notNull(),
  // Sem `balance`: o saldo vem do Open Finance (snapshot em
  // `open_finance_snapshots`), nunca de um valor digitado.
  color: varchar("color", { length: 7 }).default("#6366f1").notNull(),
  icon: varchar("icon", { length: 50 }).default("wallet").notNull(),
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
  // Nome oficial vindo do banco (Pluggy), antes de qualquer edição. O sync o
  // regrava a cada rodada; `name` é o campo do usuário e pode divergir dele.
  // Nulo só até o primeiro sync depois da migração.
  originalName: varchar("original_name", { length: 255 }),
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
  source: transactionSourceEnum("source").default("open_finance").notNull(),
  // Id da transação no provedor. É a chave de idempotência do sync (ver
  // modules/open-finance/sync.ts) — toda transação tem, pois toda vem de lá
  externalId: varchar("external_id", { length: 255 }).notNull().unique(),
  status: transactionStatusEnum("status").default("posted").notNull(),
  kind: transactionKindEnum("kind").default("regular").notNull(),
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

// ── Open Finance (spec 04) ───────────────────────────────────────────────────
// O banco é o cache do Open Finance: transações, saldos e investimentos são
// gravados a cada leitura bem-sucedida da Pluggy e servidos daqui. A Pluggy só
// é chamada quando o dado está velho (ver modules/open-finance/snapshots.ts).

export const syncRunStatusEnum = pgEnum("sync_run_status", [
  "running",
  "success",
  "error",
])

export const syncTriggerEnum = pgEnum("sync_trigger", [
  "manual", // botão "Sincronizar agora"
  "stale", // app aberto com dados velhos
  "cli", // `bun run sync:pluggy` (Agendador do Windows)
])

/** Conexão ("item") com um banco. Nunca guarda credencial bancária. */
export const pluggyItems = pgTable("pluggy_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemId: varchar("item_id", { length: 255 }).notNull().unique(),
  connectorName: varchar("connector_name", { length: 255 }),
  status: varchar("status", { length: 40 }),
  executionStatus: varchar("execution_status", { length: 60 }),
  // Última coleta feita pela Pluggy no banco (não pelo nosso sync)
  providerUpdatedAt: timestamp("provider_updated_at"),
  lastSyncedAt: timestamp("last_synced_at"),
  // Última sync com a janela completa (12 meses) — detecta exclusões antigas
  lastFullSyncAt: timestamp("last_full_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})

/** Conta do provedor e seu vínculo com uma conta interna. */
export const pluggyAccounts = pgTable("pluggy_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  pluggyItemId: uuid("pluggy_item_id")
    .references(() => pluggyItems.id, { onDelete: "cascade" })
    .notNull(),
  providerAccountId: varchar("provider_account_id", { length: 255 })
    .notNull()
    .unique(),
  accountId: uuid("account_id")
    .references(() => accounts.id)
    .notNull(),
  type: varchar("type", { length: 20 }).notNull(), // BANK | CREDIT
  subtype: varchar("subtype", { length: 40 }),
  name: varchar("name", { length: 255 }),
  // Número mascarado que o provedor devolve (ex.: final do cartão)
  number: varchar("number", { length: 60 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

/** Payload cru de cada transação do provedor — auditoria e reprocessamento. */
export const pluggyTransactions = pgTable(
  "pluggy_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerTransactionId: varchar("provider_transaction_id", { length: 255 })
      .notNull()
      .unique(),
    pluggyAccountId: uuid("pluggy_account_id")
      .references(() => pluggyAccounts.id, { onDelete: "cascade" })
      .notNull(),
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (table) => [index("pluggy_transactions_tx_idx").on(table.transactionId)]
)

/** Histórico de cada sincronização. */
export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  trigger: syncTriggerEnum("trigger").notNull(),
  status: syncRunStatusEnum("status").default("running").notNull(),
  full: boolean("full").default(false).notNull(),
  fetched: integer("fetched").default(0).notNull(),
  created: integer("created").default(0).notNull(),
  updated: integer("updated").default(0).notNull(),
  removed: integer("removed").default(0).notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
})

export const snapshotKindEnum = pgEnum("snapshot_kind", ["balances", "investments"])

/**
 * Último retrato de saldos e investimentos vindo da Pluggy — uma linha por
 * tipo, sobrescrita a cada leitura bem-sucedida. Só números agregados e nomes
 * de exibição: nunca credencial, token ou número completo de conta.
 */
export const openFinanceSnapshots = pgTable("open_finance_snapshots", {
  kind: snapshotKindEnum("kind").primaryKey(),
  payload: jsonb("payload").notNull(),
  // Quando a Pluggy devolveu esse dado (não quando foi lido do banco)
  fetchedAt: timestamp("fetched_at").notNull(),
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

export const pluggyAccountsRelations = relations(pluggyAccounts, ({ one }) => ({
  account: one(accounts, {
    fields: [pluggyAccounts.accountId],
    references: [accounts.id],
  }),
  item: one(pluggyItems, {
    fields: [pluggyAccounts.pluggyItemId],
    references: [pluggyItems.id],
  }),
}))

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

export type TransactionSource = (typeof transactionSourceEnum.enumValues)[number]
export type TransactionStatus = (typeof transactionStatusEnum.enumValues)[number]
export type TransactionKind = (typeof transactionKindEnum.enumValues)[number]

export type PluggyItem = typeof pluggyItems.$inferSelect
export type PluggyAccount = typeof pluggyAccounts.$inferSelect
export type SyncRun = typeof syncRuns.$inferSelect
export type SyncTrigger = (typeof syncTriggerEnum.enumValues)[number]
export type SnapshotKind = (typeof snapshotKindEnum.enumValues)[number]

export type AppSettings = typeof appSettings.$inferSelect
export type NewAppSettings = typeof appSettings.$inferInsert
