import type {
  Account,
  AccountType,
  Bank,
  Budget,
  BudgetAmountType,
  BudgetType,
  Category,
  DashboardSummary,
  Investment,
  InvestmentContribution,
  InvestmentMovementType,
  InvestmentType,
  PaymentMethod,
  Recurrence,
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
  paymentMethodId?: string
  recurrence?: Recurrence | ""
  isEssential?: "true" | "false" | ""
  from?: string
  to?: string
}

export interface TransactionInput {
  name: string
  amount: number
  categoryId: string
  paymentMethodId: string
  accountId: string
  isEssential: boolean
  recurrence: Recurrence
  budgetId?: string | null
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

export interface InvestmentInput {
  name: string
  type: InvestmentType
  goalAmount?: number | null
  monthlyContribution?: number | null
}

export interface ContributionInput {
  type?: InvestmentMovementType
  amount: number
  date?: string
  notes?: string | null
}

export interface DashboardParams {
  month?: number
  year?: number
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
    }) => request<Account>("/accounts", { method: "POST", body: JSON.stringify(body) }),
    update: (
      id: string,
      body: { name: string; type: AccountType; color?: string; icon?: string; isDefault?: boolean }
    ) => request<Account>(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/accounts/${id}`, { method: "DELETE" }),
  },

  categories: {
    list: () => request<Category[]>("/categories"),
    create: (body: { name: string; color?: string }) =>
      request<Category>("/categories", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { name: string; color?: string }) =>
      request<Category>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/categories/${id}`, { method: "DELETE" }),
  },

  paymentMethods: {
    list: () => request<PaymentMethod[]>("/payment-methods"),
    create: (body: { name: string; color?: string }) =>
      request<PaymentMethod>("/payment-methods", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { name: string; color?: string }) =>
      request<PaymentMethod>(`/payment-methods/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/payment-methods/${id}`, { method: "DELETE" }),
  },

  banks: {
    list: () => request<Bank[]>("/banks"),
    create: (body: { name: string; color?: string }) =>
      request<Bank>("/banks", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { name: string; color?: string }) =>
      request<Bank>(`/banks/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/banks/${id}`, { method: "DELETE" }),
  },

  transactions: {
    list: (params: ListTransactionsParams = {}) => {
      const q = new URLSearchParams()
      if (params.page) q.set("page", String(params.page))
      if (params.limit) q.set("limit", String(params.limit))
      if (params.search) q.set("search", params.search)
      if (params.accountId) q.set("accountId", params.accountId)
      if (params.categoryId) q.set("categoryId", params.categoryId)
      if (params.paymentMethodId) q.set("paymentMethodId", params.paymentMethodId)
      if (params.recurrence) q.set("recurrence", params.recurrence)
      if (params.isEssential) q.set("isEssential", params.isEssential)
      if (params.from) q.set("from", params.from)
      if (params.to) q.set("to", params.to)
      return request<TransactionsResponse>(`/transactions?${q}`)
    },
    get: (id: string) => request<Transaction>(`/transactions/${id}`),
    create: (body: TransactionInput) =>
      request<Transaction>("/transactions", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: TransactionInput) =>
      request<Transaction>(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/transactions/${id}`, { method: "DELETE" }),
  },

  budgets: {
    list: (name?: string) => {
      const q = name ? `?name=${encodeURIComponent(name)}` : ""
      return request<Budget[]>(`/budgets${q}`)
    },
    get: (id: string) => request<Budget>(`/budgets/${id}`),
    create: (body: BudgetInput) =>
      request<Budget>("/budgets", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: BudgetInput) =>
      request<Budget>(`/budgets/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/budgets/${id}`, { method: "DELETE" }),
  },

  investments: {
    list: (name?: string) => {
      const q = name ? `?name=${encodeURIComponent(name)}` : ""
      return request<Investment[]>(`/investments${q}`)
    },
    get: (id: string) => request<Investment>(`/investments/${id}`),
    create: (body: InvestmentInput) =>
      request<Investment>("/investments", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: InvestmentInput) =>
      request<Investment>(`/investments/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/investments/${id}`, { method: "DELETE" }),
    contributions: {
      list: (investmentId: string) =>
        request<InvestmentContribution[]>(`/investments/${investmentId}/contributions`),
      create: (investmentId: string, body: ContributionInput) =>
        request<InvestmentContribution>(`/investments/${investmentId}/contributions`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      delete: (investmentId: string, contributionId: string) =>
        request<{ success: boolean }>(
          `/investments/${investmentId}/contributions/${contributionId}`,
          { method: "DELETE" }
        ),
    },
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
