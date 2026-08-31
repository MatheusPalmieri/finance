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
  transactions: {
    all: ["transactions"] as const,
    lists: () => [...keys.transactions.all, "list"] as const,
    list: (params: ListTransactionsParams) => [...keys.transactions.lists(), params] as const,
  },
  budgets: {
    all: ["budgets"] as const,
    list: (name?: string) => [...keys.budgets.all, "list", name ?? ""] as const,
  },
  openFinance: {
    all: ["open-finance"] as const,
    connections: () => [...keys.openFinance.all, "connections"] as const,
    transactions: (id: string, page: number) =>
      [...keys.openFinance.all, "transactions", id, page] as const,
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

export function useBulkCreateTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: TransactionInput[]) => api.transactions.bulkCreate(items),
    onSuccess: ({ created }) => {
      qc.invalidateQueries({ queryKey: keys.transactions.all })
      qc.invalidateQueries({ queryKey: keys.accounts.all })
      qc.invalidateQueries({ queryKey: keys.dashboard.all })
      toast.success(created === 1 ? "1 transação importada" : `${created} transações importadas`)
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao importar transações"),
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

// ── Open Finance ──────────────────────────────────────────────────────────────
export function useOpenFinanceConnections() {
  return useQuery({
    queryKey: keys.openFinance.connections(),
    queryFn: api.openFinance.listConnections,
  })
}

export function useOpenFinanceTransactions(id: string, page: number) {
  return useQuery({
    queryKey: keys.openFinance.transactions(id, page),
    queryFn: () => api.openFinance.transactions(id, { page }),
    placeholderData: keepPreviousData,
    enabled: !!id,
  })
}

export function useCreateOpenFinanceConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.openFinance.createConnection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.openFinance.all })
      toast.success("Conexão criada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao criar conexão"),
  })
}

export function useSyncOpenFinanceConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.openFinance.sync(id),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: keys.openFinance.all })
      if (run.status === "ERROR") {
        toast.error(run.errorMessage ?? "Falha na sincronização")
      } else {
        toast.success(
          `Sincronizado: ${run.transactionsCreated} nova(s), ${run.transactionsUpdated} atualizada(s)`
        )
      }
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao sincronizar"),
  })
}

export function useDeleteOpenFinanceConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.openFinance.deleteConnection(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.openFinance.all })
      toast.success("Conexão removida")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao remover conexão"),
  })
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function useDashboardSummary(params: DashboardParams = {}) {
  return useQuery({
    queryKey: keys.dashboard.summary(params),
    queryFn: () => api.dashboard.summary(params),
  })
}
