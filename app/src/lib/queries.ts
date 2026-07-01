import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"
import {
  api,
  type BudgetInput,
  type DashboardParams,
  type ListTransactionsParams,
  type TransactionInput,
} from "./api"
import type { AccountType } from "@/types/finance"

// ── Query keys ────────────────────────────────────────────────────────────────
export const keys = {
  accounts: {
    all: ["accounts"] as const,
    list: () => [...keys.accounts.all, "list"] as const,
    default: () => [...keys.accounts.all, "default"] as const,
  },
  categories: {
    all: ["categories"] as const,
    list: () => [...keys.categories.all, "list"] as const,
  },
  paymentMethods: {
    all: ["payment-methods"] as const,
    list: () => [...keys.paymentMethods.all, "list"] as const,
  },
  banks: {
    all: ["banks"] as const,
    list: () => [...keys.banks.all, "list"] as const,
  },
  transactions: {
    all: ["transactions"] as const,
    lists: () => [...keys.transactions.all, "list"] as const,
    list: (params: ListTransactionsParams) => [...keys.transactions.lists(), params] as const,
  },
  budgets: {
    all: ["budgets"] as const,
    list: (name?: string) => [...keys.budgets.all, "list", name ?? ""] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    summary: (params: DashboardParams) => [...keys.dashboard.all, "summary", params] as const,
  },
}

// ── Accounts ──────────────────────────────────────────────────────────────────
export function useAccounts() {
  return useQuery({ queryKey: keys.accounts.list(), queryFn: api.accounts.list })
}

export function useDefaultAccount() {
  return useQuery({ queryKey: keys.accounts.default(), queryFn: api.accounts.default })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.accounts.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.accounts.all })
      qc.invalidateQueries({ queryKey: keys.dashboard.all })
      toast.success("Conta criada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao criar conta"),
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      name: string
      type: AccountType
      balance?: number
      color?: string
      icon?: string
      isDefault?: boolean
    }) => api.accounts.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.accounts.all })
      toast.success("Conta atualizada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao atualizar conta"),
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.accounts.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.accounts.all })
      qc.invalidateQueries({ queryKey: keys.dashboard.all })
      toast.success("Conta excluída")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao excluir conta"),
  })
}

// ── Categories ────────────────────────────────────────────────────────────────
export function useCategories() {
  return useQuery({
    queryKey: keys.categories.list(),
    queryFn: api.categories.list,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.categories.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.categories.all })
      toast.success("Categoria criada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao criar categoria"),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; color?: string }) =>
      api.categories.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.categories.all })
      toast.success("Categoria atualizada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao atualizar categoria"),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.categories.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.categories.all })
      qc.invalidateQueries({ queryKey: keys.budgets.all })
      toast.success("Categoria excluída")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao excluir categoria"),
  })
}

// ── Payment methods ─────────────────────────────────────────────────────────────
export function usePaymentMethods() {
  return useQuery({
    queryKey: keys.paymentMethods.list(),
    queryFn: api.paymentMethods.list,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreatePaymentMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.paymentMethods.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.paymentMethods.all })
      toast.success("Forma de pagamento criada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao criar forma de pagamento"),
  })
}

export function useUpdatePaymentMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; color?: string }) =>
      api.paymentMethods.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.paymentMethods.all })
      toast.success("Forma de pagamento atualizada")
    },
    onError: (e: Error) =>
      toast.error(e.message ?? "Erro ao atualizar forma de pagamento"),
  })
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.paymentMethods.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.paymentMethods.all })
      toast.success("Forma de pagamento excluída")
    },
    onError: (e: Error) =>
      toast.error(e.message ?? "Erro ao excluir forma de pagamento"),
  })
}

// ── Banks ─────────────────────────────────────────────────────────────────────
export function useBanks() {
  return useQuery({
    queryKey: keys.banks.list(),
    queryFn: api.banks.list,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateBank() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.banks.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.banks.all })
      toast.success("Banco criado")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao criar banco"),
  })
}

export function useUpdateBank() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; color?: string }) =>
      api.banks.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.banks.all })
      toast.success("Banco atualizado")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao atualizar banco"),
  })
}

export function useDeleteBank() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.banks.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.banks.all })
      toast.success("Banco excluído")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao excluir banco"),
  })
}

// ── Transactions ──────────────────────────────────────────────────────────────
export function useTransactions(params: ListTransactionsParams) {
  return useQuery({
    queryKey: keys.transactions.list(params),
    queryFn: () => api.transactions.list(params),
    placeholderData: keepPreviousData,
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.transactions.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.transactions.all })
      qc.invalidateQueries({ queryKey: keys.accounts.all })
      qc.invalidateQueries({ queryKey: keys.dashboard.all })
      toast.success("Transação criada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao criar transação"),
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & TransactionInput) =>
      api.transactions.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.transactions.all })
      qc.invalidateQueries({ queryKey: keys.accounts.all })
      qc.invalidateQueries({ queryKey: keys.dashboard.all })
      toast.success("Transação atualizada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao atualizar transação"),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.transactions.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.transactions.all })
      qc.invalidateQueries({ queryKey: keys.accounts.all })
      qc.invalidateQueries({ queryKey: keys.dashboard.all })
      toast.success("Transação excluída")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao excluir transação"),
  })
}

// ── Budgets ───────────────────────────────────────────────────────────────────
export function useBudgets(name?: string) {
  return useQuery({
    queryKey: keys.budgets.list(name),
    queryFn: () => api.budgets.list(name),
  })
}

export function useCreateBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: BudgetInput) => api.budgets.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.budgets.all })
      toast.success("Orçamento criado")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao criar orçamento"),
  })
}

export function useUpdateBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & BudgetInput) =>
      api.budgets.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.budgets.all })
      qc.invalidateQueries({ queryKey: keys.transactions.all })
      toast.success("Orçamento atualizado")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao atualizar orçamento"),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.budgets.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.budgets.all })
      toast.success("Orçamento excluído")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao excluir orçamento"),
  })
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function useDashboardSummary(params: DashboardParams = {}) {
  return useQuery({
    queryKey: keys.dashboard.summary(params),
    queryFn: () => api.dashboard.summary(params),
  })
}
