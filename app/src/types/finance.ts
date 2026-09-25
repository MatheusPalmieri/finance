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
  color: string
  icon: string
  /** Ligada ao Open Finance (só em GET /accounts). Sem saldo aqui: ele vem de
   * GET /open-finance/balances — nunca é digitado. */
  openFinance?: boolean
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  color: string
  createdAt: string
}

export interface Transaction {
  id: string
  name: string
  /** Nome oficial do banco; nulo só antes do primeiro sync após a migração */
  originalName: string | null
  amount: string
  categoryId: string
  paymentMethod: PaymentMethod
  accountId: string
  isEssential: boolean
  recurrence: Recurrence
  budgetId: string | null
  date: string
  notes: string | null
  source: TransactionSource
  externalId: string
  status: TransactionStatus
  kind: TransactionKind
  createdAt: string
  updatedAt: string
  account?: Account
  category?: Category | null
  budget?: Budget | null
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

/** Campos que "aplicar às existentes" altera numa transação. */
export type RuleApplyField =
  | "name"
  | "category"
  | "essential"
  | "recurrence"
  | "budget"

/** Prévia de "aplicar às existentes": só as transações que mudariam. */
export interface RuleApplyPreview {
  total: number
  data: {
    id: string
    date: string
    amount: string
    originalName: string | null
    name: string
    nextName: string
    fields: RuleApplyField[]
  }[]
}

export type RecurringStatus = "ACTIVE" | "OVERDUE" | "CANCELLED"

export interface RecurringSeries {
  id: string
  merchantKey: string
  label: string
  categoryId: string | null
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

// ── Projeção de fluxo de caixa ──────────────────────────────────────────────
export interface Percentiles {
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export interface ProjectedMonth {
  month: number
  year: number
  label: string
  expectedIncome: number
  fixedExpenses: number
  variableExpensesP50: number
  knownTransactions: number
  scenarioImpact: number
  balance: Percentiles
  probNegative: number
}

export interface CashflowProjection {
  openingBalance: number
  openingAccounts: { id: string; name: string; balance: number }[]
  /**
   * Sempre Open Finance: "open_finance" = retrato recente; "stale" = Pluggy
   * fora do ar, último retrato conhecido; "unavailable" = nunca sincronizou.
   */
  openingBalanceSource: "open_finance" | "stale" | "unavailable"
  /** Quando a Pluggy devolveu o saldo usado (ISO). */
  openingBalanceFetchedAt: string | null
  months: ProjectedMonth[]
  summary: {
    endBalanceP50: number
    worstMonthLabel: string
    minBalanceP10: number
    probAnyNegative: number
  }
  assumptions: {
    historyMonths: number
    lowConfidenceCategories: string[]
    categoriesWithTrend: { categoryName: string; monthlyPct: number }[]
    simulationRuns: number
    seed: number
    minimumReserveBrl: number
    minimumReserveIsDefault: boolean
    recurringIncome: {
      monthlyTotal: number
      sources: { label: string; monthlyAmount: number; occurrences: number }[]
    }
  }
}

export type ScenarioEvent =
  | {
      kind: "installment_purchase"
      label: string
      totalAmount: number
      installments: number
      monthlyInterestPct?: number
      startMonth?: string | null
      categoryId?: string | null
    }
  | {
      kind: "recurring_change"
      label: string
      monthlyAmount: number
      startMonth?: string | null
      endMonth?: string | null
      categoryId?: string | null
    }
  | {
      kind: "one_off"
      label: string
      amount: number
      month: string
    }
  | {
      kind: "income_change"
      label: string
      monthlyAmount: number
      startMonth?: string | null
    }

export type Verdict = "safe" | "tight" | "risky" | "no"

export interface AffordabilityVerdict {
  verdict: Verdict
  probAnyNegative: number
  minBalanceP10: number
  minimumReserveBrl: number
  reason: string
}

export interface SimulateResponse {
  base: CashflowProjection
  withScenario: CashflowProjection
  verdict: AffordabilityVerdict
}

export interface AffordResponse extends SimulateResponse {
  actions: {
    maxAffordableTotal: number | null
    saferInstallments: number | null
    bestStartMonth: string | null
  }
  event: ScenarioEvent
}

export interface ParseScenarioResponse {
  events: ScenarioEvent[]
  interpretation: string
  aiAvailable: boolean
}

export interface AppSettings {
  id: number
  minimumReserveBrl: string | null
  defaultHorizonMonths: number
  updatedAt: string
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  safe: "Dá pra comprar",
  tight: "Dá, mas aperta",
  risky: "Arriscado",
  no: "Não dá",
}

export const VERDICT_HEX: Record<Verdict, string> = {
  safe: FINANCE.income,
  tight: PALETTE.amber,
  risky: PALETTE.orange,
  no: FINANCE.expense,
}

export const SCENARIO_KIND_LABELS: Record<ScenarioEvent["kind"], string> = {
  installment_purchase: "Compra",
  recurring_change: "Gasto recorrente",
  one_off: "Lançamento único",
  income_change: "Mudança na renda",
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
  /** Despesas ainda sem categoria (não entram em essencial/não essencial). */
  unclassifiedExpenses: string
  unclassifiedCount: number
  /** Mês anterior até o mesmo dia, para o ritmo do gasto. */
  pace: { previousTotal: string; cutoffDay: number; partial: boolean }
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

// ── Open Finance (spec 04) ────────────────────────────────────────────────────

// Toda transação vem do Open Finance — não existe lançamento manual nem CSV
export type TransactionSource = "open_finance"
export type TransactionStatus = "posted" | "pending"
// Só `regular` entra nas análises — os demais são dinheiro mudando de lugar
export type TransactionKind =
  | "regular"
  | "bill_payment"
  | "investment"
  | "own_transfer"

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  regular: "Regular",
  bill_payment: "Pagamento de fatura",
  investment: "Aplicação/resgate",
  own_transfer: "Transferência própria",
}

export type SyncTrigger = "manual" | "stale" | "cli"

export const SYNC_TRIGGER_LABELS: Record<SyncTrigger, string> = {
  manual: "Manual",
  stale: "Ao abrir o app",
  cli: "Script/agendador",
}

export interface SyncRun {
  id: string
  trigger: SyncTrigger
  status: "running" | "success" | "error"
  full: boolean
  fetched: number
  created: number
  updated: number
  removed: number
  errorMessage: string | null
  startedAt: string
  finishedAt: string | null
}

export interface OpenFinanceLinkedAccount {
  id: string
  providerAccountId: string
  type: "BANK" | "CREDIT"
  subtype: string | null
  name: string | null
  number: string | null
  accountId: string
  accountName: string
}

export interface OpenFinanceStatus {
  configured: boolean
  running: boolean
  stale: boolean
  startedBackgroundSync: boolean
  lastSyncedAt: string | null
  items: {
    itemId: string
    connectorName: string | null
    status: string | null
    executionStatus: string | null
    providerUpdatedAt: string | null
    lastSyncedAt: string | null
    lastFullSyncAt: string | null
  }[]
  accounts: OpenFinanceLinkedAccount[]
  lastRun: SyncRun | null
}

/**
 * Metadados do retrato do Open Finance. O backend guarda o último retrato no
 * banco e só vai à Pluggy quando ele vence — ver domain/open-finance.md.
 */
export interface SnapshotMeta {
  /** `false` só quando nunca houve retrato e a Pluggy não respondeu. */
  available: boolean
  /** "live" = buscado agora; "cache" = do banco; "none" = sem dado. */
  source: "live" | "cache" | "none"
  /** Pluggy fora do ar: é o último dado conhecido, não o atual. */
  stale: boolean
  error: string | null
  /** Quando a Pluggy devolveu o dado (ISO). */
  fetchedAt: string | null
}

export interface AccountBalance {
  accountId: string
  accountName: string
  providerAccountId: string
  type: "BANK" | "CREDIT"
  /** Conta: saldo disponível. Cartão: usado do limite. */
  balance: number
  creditLimit: number | null
  availableCredit: number | null
  dueDate: string | null
  minimumPayment: number | null
  /** Cartão: fatura do mês (aberta). `balance` é a dívida total, com parcelas futuras. */
  monthBill?: number | null
}

export interface BalancesSnapshot extends SnapshotMeta {
  accounts: AccountBalance[]
  cash: number
  cardDebt: number
}

export type InvestmentClass =
  | "Renda fixa"
  | "FIIs"
  | "Ações"
  | "BDRs"
  | "ETFs"
  | "Fundos"
  | "Previdência"
  | "Outros"

export interface InvestmentPosition {
  id: string
  name: string
  code: string | null
  type: string | null
  subtype: string | null
  assetClass: InvestmentClass
  balance: number
  invested: number | null
  profit: number | null
  profitPct: number | null
  quantity: number | null
  price: number | null
  averagePrice: number | null
  taxes: number | null
  rate: number | null
  rateType: string | null
  dueDate: string | null
  issuer: string | null
  liquid: boolean
  incomeLast12m: number
}

export interface InvestmentsSnapshot extends SnapshotMeta {
  total: number
  invested: number
  profit: number
  liquid: number
  byClass: {
    assetClass: InvestmentClass
    total: number
    pct: number
    count: number
  }[]
  positions: InvestmentPosition[]
  income: { last12m: number; byMonth: { month: string; total: number }[] }
}

export const ASSET_CLASS_HEX: Record<InvestmentClass, string> = {
  "Renda fixa": PALETTE.emerald,
  FIIs: PALETTE.blue,
  Ações: PALETTE.amber,
  BDRs: PALETTE.violet,
  ETFs: PALETTE.cyan,
  Fundos: PALETTE.rose,
  Previdência: PALETTE.orange,
  Outros: FINANCE.neutral,
}

export interface SyncReport {
  runId: string | null
  dryRun: boolean
  full: boolean
  fetched: number
  created: number
  updated: number
  removed: number
  unchanged: number
}
