import { FINANCE, PALETTE } from "@/lib/tokens"

export type AccountType =
  | "CHECKING"
  | "SAVINGS"
  | "CREDIT_CARD"
  | "INVESTMENT"
  | "CASH"
  | "OTHER"
export type Recurrence = "fixed" | "variable"
export type BudgetType = "essential" | "desire" | "investment"
export type BudgetAmountType = "fixed" | "variable"
// Lista fixa do sistema — não é mais CRUD do usuário (ver .claude/docs/domain/transaction.md)
export type PaymentMethod =
  | "cash"
  | "pix"
  | "credit_card"
  | "debit_card"
  | "boleto"
  | "transfer"

export interface Account {
  id: string
  name: string
  type: AccountType
  balance: string
  color: string
  icon: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  color: string
  createdAt: string
}

// Agrupamento livre e opcional para transações — independente de Account
export interface Wallet {
  id: string
  name: string
  color: string
  createdAt: string
}

export interface Transaction {
  id: string
  name: string
  amount: string
  categoryId: string
  paymentMethod: PaymentMethod
  accountId: string
  isEssential: boolean
  recurrence: Recurrence
  budgetId: string | null
  walletId: string | null
  date: string
  notes: string | null
  createdAt: string
  updatedAt: string
  account?: Account
  category?: Category | null
  budget?: Budget | null
  wallet?: Wallet | null
}

export interface Budget {
  id: string
  name: string
  type: BudgetType
  amountType: BudgetAmountType
  amount: string | null
  amountMin: string | null
  amountMax: string | null
  createdAt: string
  updatedAt: string
}

// ── Classificação inteligente ───────────────────────────────────────────────
export type RuleSource = "seed" | "manual" | "learned"
export type RuleMatchType = "contains" | "exact" | "regex"
export type SuggestionSource = "rule" | "knn" | "llm" | "none"

export interface ClassificationRule {
  id: string
  pattern: string
  matchType: RuleMatchType
  source: RuleSource
  priority: number
  renameTo: string | null
  categoryId: string | null
  paymentMethod: PaymentMethod | null
  recurrence: Recurrence | null
  isEssential: boolean | null
  forceIncome: boolean | null
  budgetId: string | null
  enabled: boolean
  hitCount: number
  lastHitAt: string | null
  createdAt: string
  updatedAt: string
  category?: Category | null
  budget?: Budget | null
}

export interface Suggestion {
  index: number
  source: SuggestionSource
  ruleId: string | null
  confidence: number
  suggestedName: string | null
  categoryId: string | null
  paymentMethod: PaymentMethod | null
  recurrence: Recurrence | null
  isEssential: boolean | null
  budgetId: string | null
  forceIncome: boolean | null
}

export interface SuggestResponse {
  aiAvailable: boolean
  items: Suggestion[]
  stats: {
    rule: number
    knn: number
    llm: number
    none: number
    llmLatencyMs: number | null
  }
}

export interface RuleTestResponse {
  matches: { id: string; name: string; amount: string; date: string }[]
  total: number
}

export type RecurringStatus = "ACTIVE" | "OVERDUE" | "CANCELLED"

export interface RecurringSeries {
  id: string
  merchantKey: string
  label: string
  categoryId: string | null
  walletId: string | null
  intervalDays: number
  occurrences: number
  averageAmount: string
  lastAmount: string
  firstAmount: string
  firstChargeDate: string
  lastChargeDate: string
  expectedNextDate: string
  status: RecurringStatus
  dismissed: boolean
  detectedAt: string
  updatedAt: string
  category?: Category | null
  wallet?: Wallet | null
  monthlyCostBrl: number
  priceChangePct: number | null
  priceChangeSince: string | null
}

export interface RecurringResponse {
  data: RecurringSeries[]
  totalMonthly: number
}

export const RULE_SOURCE_LABELS: Record<RuleSource, string> = {
  seed: "padrão",
  manual: "manual",
  learned: "aprendida",
}

export const RULE_MATCH_LABELS: Record<RuleMatchType, string> = {
  contains: "Contém",
  exact: "Exata",
  regex: "Regex",
}

export const SUGGESTION_SOURCE_LABELS: Record<SuggestionSource, string> = {
  rule: "regra",
  knn: "histórico",
  llm: "IA",
  none: "sem sugestão",
}

export const RECURRING_STATUS_LABELS: Record<RecurringStatus, string> = {
  ACTIVE: "Ativa",
  OVERDUE: "Atrasada",
  CANCELLED: "Encerrada",
}

export const RECURRING_INTERVAL_LABELS: Record<number, string> = {
  7: "Semanal",
  30: "Mensal",
  90: "Trimestral",
  365: "Anual",
}

// ── Check-up mensal ─────────────────────────────────────────────────────────
export type ReportStatus = "GENERATED" | "NARRATED" | "NARRATION_FAILED"

export interface Scalar {
  current: number
  previous: number
  deltaPct: number | null
}

export interface NullableScalar {
  current: number | null
  previous: number | null
  deltaPct: number | null
}

export type BudgetLineStatus = "over" | "under" | "on_track" | "missing"

export interface BudgetLine {
  budgetId: string
  name: string
  type: BudgetType
  amountType: BudgetAmountType
  plannedBrl: number | null
  plannedMinBrl: number | null
  plannedMaxBrl: number | null
  actualBrl: number
  status: BudgetLineStatus
  transactionCount: number
}

export interface DistributionBucket {
  amountBrl: number
  pct: number
  targetPct: number
  deltaPp: number
}

export type AnomalySeverity = "high" | "medium" | "saving"

export interface Anomaly {
  categoryId: string
  categoryName: string
  color: string
  currentBrl: number
  medianBrl: number
  robustZ: number
  severity: AnomalySeverity
  history: { month: string; amountBrl: number }[]
  topTransactions: {
    id: string
    name: string
    amountBrl: number
    date: string
  }[]
}

export interface Mover {
  categoryId: string
  categoryName: string
  color: string
  currentBrl: number
  previousBrl: number
  deltaBrl: number
}

export interface MonthlyReportMetrics {
  period: {
    month: number
    year: number
    walletId: string | null
    from: string
    to: string
    partial: boolean
  }
  totals: {
    totalExpenses: Scalar
    totalIncome: Scalar
    netResult: Scalar
    savingsRate: NullableScalar
    transactionCount: Scalar
    avgTicket: Scalar
    noSpendDays: Scalar
  }
  biggestExpense: {
    id: string
    name: string
    amountBrl: number
    date: string
    categoryName: string | null
  } | null
  budgets: BudgetLine[]
  distribution: Record<BudgetType, DistributionBucket>
  anomalies: Anomaly[]
  topMovers: { up: Mover[]; down: Mover[] }
  newMerchants: {
    merchantKey: string
    label: string
    totalBrl: number
    transactionCount: number
  }[]
  subscriptions: {
    totalMonthlyBrl: number
    activeCount: number
    newThisMonth: { id: string; label: string; monthlyCostBrl: number }[]
    priceIncreases: {
      id: string
      label: string
      monthlyCostBrl: number
      priceChangePct: number
    }[]
    inactive: { id: string; label: string; status: string }[]
  } | null
}

export type InsightKind =
  | "budget_over"
  | "budget_missing"
  | "category_spike"
  | "category_saving"
  | "rule_503020_off"
  | "subscription_new"
  | "subscription_price_up"
  | "negative_month"
  | "record_month"

export type InsightSeverity = "info" | "warn" | "critical"

export interface Insight {
  kind: InsightKind
  severity: InsightSeverity
  title: string
  amountBrl: number | null
  categoryId?: string
  budgetId?: string
  recurringSeriesId?: string
  facts: Record<string, number | string>
}

export interface NarrativeSuggestion {
  title: string
  rationale: string
  estimatedSavingBrl: number | null
  insightKind: string | null
}

export interface MonthlyReport {
  id: string
  month: number
  year: number
  walletId: string | null
  status: ReportStatus
  metrics: MonthlyReportMetrics
  insights: Insight[]
  narrative: string | null
  suggestions: NarrativeSuggestion[] | null
  narrativeProvider: string | null
  narrativeModel: string | null
  generatedAt: string
  aiAvailable: boolean
}

export interface MonthlyReportSummary {
  id: string
  month: number
  year: number
  walletId: string | null
  status: ReportStatus
  generatedAt: string
  totalExpenses: number
  netResult: number
  criticalInsights: number
}

export interface LlmHealth {
  available: boolean
  provider: string | null
  model: string | null
  detail?: string
}

export const BUDGET_LINE_STATUS_LABELS: Record<BudgetLineStatus, string> = {
  over: "Estourou",
  under: "Abaixo",
  on_track: "No alvo",
  missing: "Sem lançamento",
}

export const INSIGHT_SEVERITY_HEX: Record<InsightSeverity, string> = {
  critical: PALETTE.red,
  warn: PALETTE.amber,
  info: PALETTE.blue,
}

// ── Open Finance (somente leitura) ──────────────────────────────────────────
export type OfConnectionStatus =
  | "PENDING"
  | "UPDATING"
  | "ACTIVE"
  | "LOGIN_ERROR"
  | "ERROR"
  | "DELETED"

export type OfTxDirection = "INFLOW" | "OUTFLOW"
export type OfSyncStatus = "RUNNING" | "SUCCESS" | "ERROR"

export interface OpenFinanceAccount {
  id: string
  connectionId: string
  providerAccountId: string
  linkedAccountId: string | null
  type: string | null
  name: string | null
  number: string | null
  balance: string | null
  currencyCode: string | null
  createdAt: string
  updatedAt: string
}

export interface OpenFinanceSyncRun {
  id: string
  connectionId: string
  status: OfSyncStatus
  trigger: "INITIAL" | "MANUAL" | "WEBHOOK"
  accountsSynced: number
  transactionsCreated: number
  transactionsUpdated: number
  errorMessage: string | null
  startedAt: string
  finishedAt: string | null
}

export interface OpenFinanceConnection {
  id: string
  provider: string
  providerItemId: string
  connectorId: string | null
  connectorName: string | null
  status: OfConnectionStatus
  statusDetail: string | null
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
  accounts: OpenFinanceAccount[]
  syncRuns: OpenFinanceSyncRun[]
}

export interface OpenFinanceTransaction {
  id: string
  connectionId: string
  ofAccountId: string
  providerTransactionId: string
  description: string
  amount: string
  currencyCode: string | null
  date: string
  direction: OfTxDirection
  status: string | null
  category: string | null
  createdAt: string
  updatedAt: string
}

export interface OpenFinanceTransactionsResponse {
  data: OpenFinanceTransaction[]
  total: number
  page: number
  limit: number
}

export const OF_CONNECTION_STATUS_LABELS: Record<OfConnectionStatus, string> = {
  PENDING: "Pendente",
  UPDATING: "Atualizando",
  ACTIVE: "Ativa",
  LOGIN_ERROR: "Erro de login",
  ERROR: "Erro",
  DELETED: "Desconectada",
}

export interface TransactionsResponse {
  data: Transaction[]
  total: number
  page: number
  limit: number
}

export interface NamedAmount {
  id: string
  name: string
  color: string
  amount: string
}

export interface DashboardSummary {
  totalExpenses: string
  essentialExpenses: string
  nonEssentialExpenses: string
  fixedExpenses: string
  variableExpenses: string
  transactionCount: number
  expensesByCategory: {
    categoryId: string
    categoryName: string
    color: string
    amount: string
  }[]
  expensesByPaymentMethod: NamedAmount[]
  expensesByAccount: NamedAmount[]
  monthlyTrend: { month: string; total: number }[]
  recentTransactions: Transaction[]
}

// ── Labels e cores ──────────────────────────────────────────────────────────
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CREDIT_CARD: "Cartão de crédito",
  INVESTMENT: "Investimento",
  CASH: "Dinheiro",
  OTHER: "Outro",
}

export const ACCOUNT_TYPE_HEX: Record<AccountType, string> = {
  CHECKING: PALETTE.blue,
  SAVINGS: PALETTE.emerald,
  CREDIT_CARD: PALETTE.red,
  INVESTMENT: PALETTE.violet,
  CASH: PALETTE.gray,
  OTHER: PALETTE.gray,
}

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  fixed: "Fixo",
  variable: "Variável",
}

export const BUDGET_TYPE_LABELS: Record<BudgetType, string> = {
  essential: "Essencial",
  desire: "Desejo",
  investment: "Investimento",
}

// Cores por tipo, refletindo a regra 50/30/20
export const BUDGET_TYPE_HEX: Record<BudgetType, string> = {
  essential: FINANCE.essential,
  desire: FINANCE.nonEssential,
  investment: FINANCE.income,
}

export const BUDGET_TYPE_TARGET: Record<BudgetType, number> = {
  essential: 50,
  desire: 30,
  investment: 20,
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  pix: "Pix",
  cash: "Dinheiro",
  boleto: "Boleto",
  transfer: "Transferência",
}

export const PAYMENT_METHOD_HEX: Record<PaymentMethod, string> = {
  credit_card: PALETTE.red,
  debit_card: PALETTE.blue,
  pix: PALETTE.cyan,
  cash: PALETTE.emerald,
  boleto: PALETTE.amber,
  transfer: PALETTE.violet,
}

export const PAYMENT_METHOD_ORDER: PaymentMethod[] = [
  "credit_card",
  "debit_card",
  "pix",
  "cash",
  "boleto",
  "transfer",
]

export const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]
