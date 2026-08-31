import { FINANCE, PALETTE } from "@/lib/tokens"

export type AccountType = "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "INVESTMENT" | "CASH" | "OTHER"
export type Recurrence = "fixed" | "variable"
export type BudgetType = "essential" | "desire" | "investment"
export type BudgetAmountType = "fixed" | "variable"
// Lista fixa do sistema — não é mais CRUD do usuário (ver .claude/docs/domain/transaction.md)
export type PaymentMethod = "cash" | "pix" | "credit_card" | "debit_card" | "boleto" | "transfer"

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
  date: string
  notes: string | null
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
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]
