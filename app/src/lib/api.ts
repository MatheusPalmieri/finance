import type {
  Account,
  AccountType,
  AffordResponse,
  AppSettings,
  Budget,
  CashflowProjection,
  BudgetAmountType,
  BudgetType,
  Category,
  ClassificationRule,
  DashboardSummary,
  LlmHealth,
  MonthlyReport,
  MonthlyReportSummary,
  ParseScenarioResponse,
  PaymentMethod,
  Recurrence,
  ScenarioEvent,
  SimulateResponse,
  RecurringResponse,
  RecurringStatus,
  RuleMatchType,
  RuleSource,
  RuleTestResponse,
  SuggestResponse,
  Transaction,
  TransactionsResponse,
  Wallet,
} from "@/types/finance"

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export interface ListTransactionsParams {
  page?: number
  limit?: number
  search?: string
  accountId?: string
  categoryId?: string
  walletId?: string
  paymentMethod?: PaymentMethod | ""
  recurrence?: Recurrence | ""
  isEssential?: "true" | "false" | ""
  from?: string
  to?: string
}

export interface TransactionInput {
  name: string
  amount: number
  categoryId: string
  paymentMethod: PaymentMethod
  accountId: string
  isEssential: boolean
  recurrence: Recurrence
  budgetId?: string | null
  walletId?: string | null
  date: string
  notes?: string | null
}

export interface BudgetInput {
  name: string
  type: BudgetType
  amountType: BudgetAmountType
  amount?: number | null
  amountMin?: number | null
  amountMax?: number | null
}

export interface DashboardParams {
  month?: number
  year?: number
  walletId?: string
}

export interface ListRulesParams {
  search?: string
  source?: RuleSource | ""
  enabled?: boolean
}

export interface RuleInput {
  pattern: string
  matchType?: RuleMatchType
  source?: RuleSource
  priority?: number
  renameTo?: string | null
  categoryId?: string | null
  paymentMethod?: PaymentMethod | null
  recurrence?: Recurrence | null
  isEssential?: boolean | null
  forceIncome?: boolean | null
  budgetId?: string | null
  enabled?: boolean
}

export interface SuggestInput {
  walletId?: string | null
  useAi?: boolean
  items: {
    index: number
    description: string
    date?: string
    amount?: number
  }[]
}

export interface FeedbackInput {
  description: string
  categoryId?: string | null
  paymentMethod?: PaymentMethod | null
  recurrence?: Recurrence | null
  isEssential?: boolean | null
  renameTo?: string | null
  budgetId?: string | null
  createRule?: boolean
}

export interface ListRecurringParams {
  walletId?: string | null
  status?: RecurringStatus | ""
  includeDismissed?: boolean
}

export interface GenerateReportInput {
  month: number
  year: number
  walletId?: string | null
  narrate?: boolean
}

export interface ForecastParams {
  walletId?: string | null
  horizonMonths?: number
}

export interface AffordInput {
  walletId?: string | null
  totalAmount: number
  installments?: number
  monthlyInterestPct?: number
  label?: string
  categoryId?: string | null
  horizonMonths?: number
}

export const api = {
  accounts: {
    list: () => request<Account[]>("/accounts"),
    get: (id: string) => request<Account>(`/accounts/${id}`),
    default: () => request<Account | null>("/accounts/default"),
    create: (body: {
      name: string
      type: AccountType
      balance?: number
      color?: string
      icon?: string
      isDefault?: boolean
    }) =>
      request<Account>("/accounts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      id: string,
      body: {
        name: string
        type: AccountType
        balance?: number
        color?: string
        icon?: string
        isDefault?: boolean
      }
    ) =>
      request<Account>(`/accounts/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/accounts/${id}`, { method: "DELETE" }),
  },

  categories: {
    list: () => request<Category[]>("/categories"),
    create: (body: { name: string; color?: string }) =>
      request<Category>("/categories", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: { name: string; color?: string }) =>
      request<Category>(`/categories/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/categories/${id}`, { method: "DELETE" }),
  },

  wallets: {
    list: () => request<Wallet[]>("/wallets"),
    create: (body: { name: string; color?: string }) =>
      request<Wallet>("/wallets", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: { name: string; color?: string }) =>
      request<Wallet>(`/wallets/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/wallets/${id}`, { method: "DELETE" }),
  },

  transactions: {
    list: (params: ListTransactionsParams = {}) => {
      const q = new URLSearchParams()
      if (params.page) q.set("page", String(params.page))
      if (params.limit) q.set("limit", String(params.limit))
      if (params.search) q.set("search", params.search)
      if (params.accountId) q.set("accountId", params.accountId)
      if (params.categoryId) q.set("categoryId", params.categoryId)
      if (params.walletId) q.set("walletId", params.walletId)
      if (params.paymentMethod) q.set("paymentMethod", params.paymentMethod)
      if (params.recurrence) q.set("recurrence", params.recurrence)
      if (params.isEssential) q.set("isEssential", params.isEssential)
      if (params.from) q.set("from", params.from)
      if (params.to) q.set("to", params.to)
      return request<TransactionsResponse>(`/transactions?${q}`)
    },
    get: (id: string) => request<Transaction>(`/transactions/${id}`),
    create: (body: TransactionInput) =>
      request<Transaction>("/transactions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: TransactionInput) =>
      request<Transaction>(`/transactions/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/transactions/${id}`, {
        method: "DELETE",
      }),
    bulkCreate: (items: TransactionInput[]) =>
      request<{ created: number }>("/transactions/bulk", {
        method: "POST",
        body: JSON.stringify({ transactions: items }),
      }),
  },

  budgets: {
    list: (name?: string) => {
      const q = name ? `?name=${encodeURIComponent(name)}` : ""
      return request<Budget[]>(`/budgets${q}`)
    },
    get: (id: string) => request<Budget>(`/budgets/${id}`),
    create: (body: BudgetInput) =>
      request<Budget>("/budgets", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: BudgetInput) =>
      request<Budget>(`/budgets/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/budgets/${id}`, { method: "DELETE" }),
  },

  classification: {
    // POST com corpo grande — é mutation, nunca query cacheada
    suggest: (body: SuggestInput) =>
      request<SuggestResponse>("/classification/suggest", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    feedback: (body: FeedbackInput) =>
      request<{ ruleId: string; created: boolean }>(
        "/classification/feedback",
        { method: "POST", body: JSON.stringify(body) }
      ),
    listRules: (params: ListRulesParams = {}) => {
      const q = new URLSearchParams()
      if (params.search) q.set("search", params.search)
      if (params.source) q.set("source", params.source)
      if (params.enabled !== undefined) q.set("enabled", String(params.enabled))
      return request<ClassificationRule[]>(`/classification/rules?${q}`)
    },
    createRule: (body: RuleInput) =>
      request<ClassificationRule>("/classification/rules", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateRule: (id: string, body: RuleInput) =>
      request<ClassificationRule>(`/classification/rules/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    toggleRule: (id: string) =>
      request<ClassificationRule>(`/classification/rules/${id}/toggle`, {
        method: "PATCH",
      }),
    deleteRule: (id: string) =>
      request<{ success: boolean }>(`/classification/rules/${id}`, {
        method: "DELETE",
      }),
    testRule: (body: { pattern: string; matchType?: RuleMatchType }) =>
      request<RuleTestResponse>("/classification/rules/test", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  recurring: {
    list: (params: ListRecurringParams = {}) => {
      const q = new URLSearchParams()
      if (params.walletId) q.set("walletId", params.walletId)
      if (params.status) q.set("status", params.status)
      if (params.includeDismissed) q.set("includeDismissed", "true")
      return request<RecurringResponse>(`/recurring?${q}`)
    },
    recalculate: (walletId?: string | null) =>
      request<{ detected: number; updated: number; removed: number }>(
        "/recurring/recalculate",
        { method: "POST", body: JSON.stringify({ walletId: walletId ?? null }) }
      ),
    dismiss: (id: string) =>
      request<{ id: string }>(`/recurring/${id}/dismiss`, { method: "PATCH" }),
    transactions: (id: string) =>
      request<{ serie: unknown; data: Transaction[] }>(
        `/recurring/${id}/transactions`
      ),
  },

  reports: {
    generate: (body: GenerateReportInput) =>
      request<MonthlyReport>("/reports/monthly/generate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    list: (walletId?: string | null) => {
      const q = walletId ? `?walletId=${walletId}` : ""
      return request<MonthlyReportSummary[]>(`/reports/monthly${q}`)
    },
    get: (id: string) => request<MonthlyReport>(`/reports/monthly/${id}`),
    current: (walletId?: string | null) => {
      const q = walletId ? `?walletId=${walletId}` : ""
      return request<MonthlyReport>(`/reports/monthly/current${q}`)
    },
    narrate: (id: string) =>
      request<MonthlyReport>(`/reports/monthly/${id}/narrate`, {
        method: "POST",
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/reports/monthly/${id}`, {
        method: "DELETE",
      }),
  },

  forecast: {
    cashflow: (params: ForecastParams = {}) => {
      const q = new URLSearchParams()
      if (params.walletId) q.set("walletId", params.walletId)
      if (params.horizonMonths)
        q.set("horizonMonths", String(params.horizonMonths))
      return request<CashflowProjection>(`/forecast/cashflow?${q}`)
    },
    simulate: (body: {
      walletId?: string | null
      horizonMonths?: number
      events: ScenarioEvent[]
    }) =>
      request<SimulateResponse>("/forecast/simulate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    afford: (body: AffordInput) =>
      request<AffordResponse>("/forecast/afford", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    parse: (text: string) =>
      request<ParseScenarioResponse>("/forecast/parse", {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
  },

  settings: {
    get: () => request<AppSettings>("/settings"),
    update: (body: {
      minimumReserveBrl?: number | null
      defaultHorizonMonths?: number
    }) =>
      request<AppSettings>("/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  },

  llm: {
    health: () => request<LlmHealth>("/llm/health"),
  },

  dashboard: {
    summary: (params: DashboardParams = {}) => {
      const q = new URLSearchParams()
      if (params.month) q.set("month", String(params.month))
      if (params.year) q.set("year", String(params.year))
      if (params.walletId) q.set("walletId", params.walletId)
      return request<DashboardSummary>(`/dashboard/summary?${q}`)
    },
  },
}
