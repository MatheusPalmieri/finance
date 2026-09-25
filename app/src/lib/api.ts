import type {
  Account,
  AffordResponse,
  AppSettings,
  BalancesSnapshot,
  Budget,
  CashflowProjection,
  BudgetAmountType,
  BudgetType,
  Category,
  ClassificationRule,
  DashboardSummary,
  InvestmentsSnapshot,
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
  OpenFinanceStatus,
  SyncReport,
  SyncRun,
  Transaction,
  TransactionsResponse,
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
  paymentMethod?: PaymentMethod | ""
  recurrence?: Recurrence | ""
  isEssential?: "true" | "false" | ""
  from?: string
  to?: string
  order?: "asc" | "desc"
}

// Reclassificação: só os campos do usuário. Valor, data e conta vêm do banco
// via Open Finance e não são editáveis
export interface TransactionClassificationInput {
  name: string
  categoryId: string
  isEssential: boolean
  recurrence: Recurrence
  budgetId?: string | null
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
  status?: RecurringStatus | ""
  includeDismissed?: boolean
}

export interface GenerateReportInput {
  month: number
  year: number
  narrate?: boolean
}

export interface ForecastParams {
  horizonMonths?: number
}

export interface AffordInput {
  totalAmount: number
  installments?: number
  monthlyInterestPct?: number
  label?: string
  categoryId?: string | null
  horizonMonths?: number
}

export const api = {
  // Contas nascem do sync do Open Finance: só a aparência é editável
  accounts: {
    list: () => request<Account[]>("/accounts"),
    get: (id: string) => request<Account>(`/accounts/${id}`),
    update: (
      id: string,
      body: { name?: string; color?: string; icon?: string }
    ) =>
      request<Account>(`/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
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

  transactions: {
    list: (params: ListTransactionsParams = {}) => {
      const q = new URLSearchParams()
      if (params.page) q.set("page", String(params.page))
      if (params.limit) q.set("limit", String(params.limit))
      if (params.search) q.set("search", params.search)
      if (params.accountId) q.set("accountId", params.accountId)
      if (params.categoryId) q.set("categoryId", params.categoryId)
      if (params.paymentMethod) q.set("paymentMethod", params.paymentMethod)
      if (params.recurrence) q.set("recurrence", params.recurrence)
      if (params.isEssential) q.set("isEssential", params.isEssential)
      if (params.from) q.set("from", params.from)
      if (params.to) q.set("to", params.to)
      if (params.order) q.set("order", params.order)
      return request<TransactionsResponse>(`/transactions?${q}`)
    },
    get: (id: string) => request<Transaction>(`/transactions/${id}`),
    // Não existe criar, importar nem excluir: tudo vem do Open Finance
    reclassify: (id: string, body: TransactionClassificationInput) =>
      request<Transaction>(`/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
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
      if (params.status) q.set("status", params.status)
      if (params.includeDismissed) q.set("includeDismissed", "true")
      return request<RecurringResponse>(`/recurring?${q}`)
    },
    recalculate: () =>
      request<{ detected: number; updated: number; removed: number }>(
        "/recurring/recalculate",
        { method: "POST" }
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
    list: () => request<MonthlyReportSummary[]>("/reports/monthly"),
    get: (id: string) => request<MonthlyReport>(`/reports/monthly/${id}`),
    current: () => request<MonthlyReport>("/reports/monthly/current"),
    forPeriod: (month: number, year: number) =>
      request<MonthlyReport>(`/reports/monthly/period/${year}/${month}`),
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
      if (params.horizonMonths)
        q.set("horizonMonths", String(params.horizonMonths))
      return request<CashflowProjection>(`/forecast/cashflow?${q}`)
    },
    simulate: (body: { horizonMonths?: number; events: ScenarioEvent[] }) =>
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

  // Open Finance (spec 04) — a única fonte de dados. Saldos e investimentos
  // vêm do último retrato salvo no banco; `fresh` força ir à Pluggy
  openFinance: {
    status: (autoSync = true) =>
      request<OpenFinanceStatus>(
        `/open-finance/status${autoSync ? "" : "?autoSync=false"}`
      ),
    sync: (body: { full?: boolean; refresh?: boolean } = {}) =>
      request<{ started: boolean }>("/open-finance/sync", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    simulate: (body: { full?: boolean } = {}) =>
      request<SyncReport>("/open-finance/sync", {
        method: "POST",
        body: JSON.stringify({ ...body, dryRun: true }),
      }),
    runs: (limit = 20) =>
      request<SyncRun[]>(`/open-finance/runs?limit=${limit}`),
    balances: (fresh = false) =>
      request<BalancesSnapshot>(
        `/open-finance/balances${fresh ? "?fresh=true" : ""}`
      ),
    investments: (fresh = false) =>
      request<InvestmentsSnapshot>(
        `/open-finance/investments${fresh ? "?fresh=true" : ""}`
      ),
    relink: (id: string, accountId: string) =>
      request<{ id: string; accountId: string; movedTransactions: number }>(
        `/open-finance/accounts/${id}`,
        { method: "PATCH", body: JSON.stringify({ accountId }) }
      ),
  },

  llm: {
    health: () => request<LlmHealth>("/llm/health"),
  },

  dashboard: {
    summary: (params: DashboardParams = {}) => {
      const q = new URLSearchParams()
      if (params.month) q.set("month", String(params.month))
      if (params.year) q.set("year", String(params.year))
      return request<DashboardSummary>(`/dashboard/summary?${q}`)
    },
  },
}
