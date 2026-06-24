export type AccountType = "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "INVESTMENT" | "CASH" | "OTHER"
export type Recurrence = "fixed" | "variable"
export type BudgetType = "essential" | "desire" | "investment"
export type BudgetAmountType = "fixed" | "variable"

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

export interface PaymentMethod {
  id: string
  name: string
  color: string
  createdAt: string
}

export interface Bank {
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
  paymentMethodId: string
  accountId: string
  isEssential: boolean
  recurrence: Recurrence
  budgetId: string | null
  date: string
  notes: string | null
  createdAt: string
  updatedAt: string
  account?: Account
  category?: Category | null
  paymentMethod?: PaymentMethod | null
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
  expensesByCategory: { categoryId: string; categoryName: string; color: string; amount: string }[]
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
  CHECKING: "#3b82f6",
  SAVINGS: "#10b981",
  CREDIT_CARD: "#ef4444",
  INVESTMENT: "#8b5cf6",
  CASH: "#6b7280",
  OTHER: "#6b7280",
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
  essential: "#f59e0b",
  desire: "#8b5cf6",
  investment: "#10b981",
}

export const BUDGET_TYPE_TARGET: Record<BudgetType, number> = {
  essential: 50,
  desire: 30,
  investment: 20,
}

export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]
