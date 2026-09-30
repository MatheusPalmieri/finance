import type { SpendingGroup } from "../../db/schema"

/** Toda métrica escalar do relatório vem com o mês anterior e a variação. */
export interface Scalar {
  current: number
  previous: number
  /** `null` quando o mês anterior é zero — divisão por zero não vira "+∞%". */
  deltaPct: number | null
}

export interface NullableScalar {
  current: number | null
  previous: number | null
  deltaPct: number | null
}

export interface ReportPeriod {
  month: number
  year: number
  from: string
  to: string
  /** `true` quando o mês ainda está em curso — o comparativo fica enviesado. */
  partial: boolean
}

export interface ReportTotals {
  totalExpenses: Scalar
  totalIncome: Scalar
  netResult: Scalar
  savingsRate: NullableScalar
  transactionCount: Scalar
  avgTicket: Scalar
  noSpendDays: Scalar
}

export interface BiggestExpense {
  id: string
  name: string
  amountBrl: number
  date: string
  categoryName: string | null
}

export type BudgetLineStatus = "over" | "under" | "on_track" | "missing"

/** Orçamento de uma categoria contra o gasto dela no mês. */
export interface BudgetLine {
  categoryId: string
  name: string
  color: string
  group: SpendingGroup
  amountType: "exact" | "range"
  /** Alvo: valor exato, ou `null` quando o orçamento é faixa. */
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
  /** Desvio em pontos percentuais contra a meta 50/30/20. */
  deltaPp: number
}

/** Gasto por grupo 50/30/20, em % da renda do mês. */
export type Distribution = Record<SpendingGroup, DistributionBucket>

export type AnomalySeverity = "high" | "medium" | "saving"

export interface AnomalyTransaction {
  id: string
  name: string
  amountBrl: number
  date: string
}

export interface Anomaly {
  categoryId: string
  categoryName: string
  color: string
  currentBrl: number
  medianBrl: number
  robustZ: number
  severity: AnomalySeverity
  /** Série dos 6 meses anteriores, para a sparkline. */
  history: { month: string; amountBrl: number }[]
  /** Sem as 3 maiores, o usuário lê "subiu 48%" e não sabe por quê. */
  topTransactions: AnomalyTransaction[]
}

export interface Mover {
  categoryId: string
  categoryName: string
  color: string
  currentBrl: number
  previousBrl: number
  /** Em valor absoluto: 300% de uma categoria de R$ 20 não é notícia. */
  deltaBrl: number
}

export interface NewMerchant {
  merchantKey: string
  label: string
  totalBrl: number
  transactionCount: number
}

export interface SubscriptionsSection {
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
}

export interface MonthlyReportMetrics {
  period: ReportPeriod
  totals: ReportTotals
  biggestExpense: BiggestExpense | null
  budgets: BudgetLine[]
  distribution: Distribution
  anomalies: Anomaly[]
  topMovers: { up: Mover[]; down: Mover[] }
  newMerchants: NewMerchant[]
  /** `null` quando não há séries recorrentes detectadas (spec 01 sem uso). */
  subscriptions: SubscriptionsSection | null
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
  /** Já pronto em pt-BR, sem IA. */
  title: string
  amountBrl: number | null
  categoryId?: string
  recurringSeriesId?: string
  /** Dados crus que a narrativa pode citar — nada além disto vai ao LLM. */
  facts: Record<string, number | string>
}

export interface NarrativeSuggestion {
  title: string
  rationale: string
  estimatedSavingBrl: number | null
  insightKind: string | null
}
