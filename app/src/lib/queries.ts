import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"
import {
  api,
  type AffordInput,
  type BudgetInput,
  type DashboardParams,
  type FeedbackInput,
  type ForecastParams,
  type GenerateReportInput,
  type ListRecurringParams,
  type ListRulesParams,
  type ListTransactionsParams,
  type RuleInput,
  type SuggestInput,
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
  wallets: {
    all: ["wallets"] as const,
    list: () => [...keys.wallets.all, "list"] as const,
  },
  transactions: {
    all: ["transactions"] as const,
    lists: () => [...keys.transactions.all, "list"] as const,
    list: (params: ListTransactionsParams) =>
      [...keys.transactions.lists(), params] as const,
  },
  budgets: {
    all: ["budgets"] as const,
    list: (name?: string) => [...keys.budgets.all, "list", name ?? ""] as const,
  },
  classification: {
    all: ["classification"] as const,
    rules: (params: ListRulesParams) =>
      [...keys.classification.all, "rules", params] as const,
  },
  recurring: {
    all: ["recurring"] as const,
    list: (params: ListRecurringParams) =>
      [...keys.recurring.all, "list", params] as const,
  },
  reports: {
    all: ["reports"] as const,
    list: (walletId?: string | null) =>
      [...keys.reports.all, "list", walletId ?? ""] as const,
    detail: (id: string) => [...keys.reports.all, "detail", id] as const,
    current: (walletId?: string | null) =>
      [...keys.reports.all, "current", walletId ?? ""] as const,
  },
  forecast: {
    all: ["forecast"] as const,
    cashflow: (params: ForecastParams) =>
      [...keys.forecast.all, "cashflow", params] as const,
  },
  settings: {
    all: ["settings"] as const,
  },
  llm: {
    all: ["llm"] as const,
    health: () => [...keys.llm.all, "health"] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    summary: (params: DashboardParams) =>
      [...keys.dashboard.all, "summary", params] as const,
  },
}

// ── Accounts ──────────────────────────────────────────────────────────────────
export function useAccounts() {
  return useQuery({
    queryKey: keys.accounts.list(),
    queryFn: api.accounts.list,
  })
}

export function useDefaultAccount() {
  return useQuery({
    queryKey: keys.accounts.default(),
    queryFn: api.accounts.default,
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.accounts.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.accounts.all })
      qc.invalidateQueries({ queryKey: keys.dashboard.all })
      qc.invalidateQueries({ queryKey: keys.forecast.all })
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
      qc.invalidateQueries({ queryKey: keys.forecast.all })
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
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      name: string
      color?: string
    }) => api.categories.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.categories.all })
      toast.success("Categoria atualizada")
    },
    onError: (e: Error) =>
      toast.error(e.message ?? "Erro ao atualizar categoria"),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.categories.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.categories.all })
      qc.invalidateQueries({ queryKey: keys.budgets.all })
      // Orçamentos são a perna fixa da projeção de fluxo de caixa
      qc.invalidateQueries({ queryKey: keys.forecast.all })
      toast.success("Categoria excluída")
    },
    onError: (e: Error) =>
      toast.error(e.message ?? "Erro ao excluir categoria"),
  })
}

// ── Wallets ───────────────────────────────────────────────────────────────────
export function useWallets() {
  return useQuery({
    queryKey: keys.wallets.list(),
    queryFn: api.wallets.list,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.wallets.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallets.all })
      toast.success("Carteira criada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao criar carteira"),
  })
}

export function useUpdateWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      name: string
      color?: string
    }) => api.wallets.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallets.all })
      toast.success("Carteira atualizada")
    },
    onError: (e: Error) =>
      toast.error(e.message ?? "Erro ao atualizar carteira"),
  })
}

export function useDeleteWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.wallets.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallets.all })
      toast.success("Carteira excluída")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao excluir carteira"),
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
      qc.invalidateQueries({ queryKey: keys.forecast.all })
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
      qc.invalidateQueries({ queryKey: keys.forecast.all })
      toast.success("Transação atualizada")
    },
    onError: (e: Error) =>
      toast.error(e.message ?? "Erro ao atualizar transação"),
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
      qc.invalidateQueries({ queryKey: keys.forecast.all })
      toast.success("Transação excluída")
    },
    onError: (e: Error) =>
      toast.error(e.message ?? "Erro ao excluir transação"),
  })
}

export function useBulkCreateTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: TransactionInput[]) =>
      api.transactions.bulkCreate(items),
    onSuccess: ({ created }) => {
      qc.invalidateQueries({ queryKey: keys.transactions.all })
      qc.invalidateQueries({ queryKey: keys.accounts.all })
      qc.invalidateQueries({ queryKey: keys.dashboard.all })
      qc.invalidateQueries({ queryKey: keys.forecast.all })
      toast.success(
        created === 1
          ? "1 transação importada"
          : `${created} transações importadas`
      )
    },
    onError: (e: Error) =>
      toast.error(e.message ?? "Erro ao importar transações"),
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
      // Orçamentos são a perna fixa da projeção de fluxo de caixa
      qc.invalidateQueries({ queryKey: keys.forecast.all })
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
      // Orçamentos são a perna fixa da projeção de fluxo de caixa
      qc.invalidateQueries({ queryKey: keys.forecast.all })
      qc.invalidateQueries({ queryKey: keys.transactions.all })
      toast.success("Orçamento atualizado")
    },
    onError: (e: Error) =>
      toast.error(e.message ?? "Erro ao atualizar orçamento"),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.budgets.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.budgets.all })
      // Orçamentos são a perna fixa da projeção de fluxo de caixa
      qc.invalidateQueries({ queryKey: keys.forecast.all })
      toast.success("Orçamento excluído")
    },
    onError: (e: Error) =>
      toast.error(e.message ?? "Erro ao excluir orçamento"),
  })
}

// ── Classificação ─────────────────────────────────────────────────────────────
// Sugestão é mutation (POST com corpo grande, não deve cachear)
export function useClassificationSuggest() {
  return useMutation({
    mutationFn: (body: SuggestInput) => api.classification.suggest(body),
  })
}

/** Corrigir uma sugestão na revisão vira regra. Falha em silêncio é aceitável
 *  aqui: a importação não pode parar porque o aprendizado falhou. */
export function useClassificationFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: FeedbackInput) => api.classification.feedback(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.classification.all })
    },
  })
}

export function useRules(params: ListRulesParams = {}) {
  return useQuery({
    queryKey: keys.classification.rules(params),
    queryFn: () => api.classification.listRules(params),
    placeholderData: keepPreviousData,
  })
}

export function useCreateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: RuleInput) => api.classification.createRule(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.classification.all })
      toast.success("Regra criada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao criar regra"),
  })
}

export function useUpdateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & RuleInput) =>
      api.classification.updateRule(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.classification.all })
      toast.success("Regra atualizada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao atualizar regra"),
  })
}

export function useToggleRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.classification.toggleRule(id),
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: keys.classification.all })
      toast.success(rule.enabled ? "Regra ativada" : "Regra desativada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao alternar regra"),
  })
}

export function useDeleteRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.classification.deleteRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.classification.all })
      toast.success("Regra excluída")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao excluir regra"),
  })
}

export function useTestRule() {
  return useMutation({
    mutationFn: api.classification.testRule,
  })
}

// ── Séries recorrentes ────────────────────────────────────────────────────────
export function useRecurring(params: ListRecurringParams = {}) {
  return useQuery({
    queryKey: keys.recurring.list(params),
    queryFn: () => api.recurring.list(params),
  })
}

export function useRecalculateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (walletId?: string | null) =>
      api.recurring.recalculate(walletId),
    onSuccess: ({ detected }) => {
      qc.invalidateQueries({ queryKey: keys.recurring.all })
      toast.success(
        detected === 1
          ? "1 série recorrente detectada"
          : `${detected} séries recorrentes detectadas`
      )
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao recalcular"),
  })
}

export function useDismissRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.recurring.dismiss(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.recurring.all })
      toast.success("Série dispensada")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao dispensar série"),
  })
}

// ── Check-up mensal ───────────────────────────────────────────────────────────
export function useCurrentReport(walletId?: string | null) {
  return useQuery({
    queryKey: keys.reports.current(walletId),
    queryFn: () => api.reports.current(walletId),
    // A geração sob demanda pode levar alguns segundos; não refazer à toa
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useReport(id: string | null) {
  return useQuery({
    queryKey: keys.reports.detail(id ?? ""),
    queryFn: () => api.reports.get(id!),
    enabled: !!id,
  })
}

export function useReportList(walletId?: string | null) {
  return useQuery({
    queryKey: keys.reports.list(walletId),
    queryFn: () => api.reports.list(walletId),
  })
}

export function useGenerateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: GenerateReportInput) =>
      toast
        .promise(api.reports.generate(body), {
          loading: "Gerando relatório...",
          success: "Relatório gerado",
          error: (e: Error) => e.message ?? "Erro ao gerar relatório",
        })
        .unwrap(),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.reports.all }),
  })
}

export function useNarrateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.reports.narrate(id),
    onSuccess: (report) => {
      qc.invalidateQueries({ queryKey: keys.reports.all })
      if (report.status === "NARRATED") toast.success("Texto gerado")
      else toast.error("A IA não produziu um texto confiável desta vez")
    },
    onError: (e: Error) => toast.error(e.message ?? "IA indisponível"),
  })
}

// ── Projeção de fluxo de caixa ────────────────────────────────────────────────
// A projeção só muda quando muda transação, orçamento ou conta — invalidar
// nessas três chaves é suficiente, então dá pra segurar por 5 min.
export function useCashflow(params: ForecastParams = {}) {
  return useQuery({
    queryKey: keys.forecast.cashflow(params),
    queryFn: () => api.forecast.cashflow(params),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useSimulate() {
  return useMutation({ mutationFn: api.forecast.simulate })
}

export function useAfford() {
  return useMutation({
    mutationFn: (body: AffordInput) => api.forecast.afford(body),
    onError: (e: Error) => toast.error(e.message ?? "Erro ao simular"),
  })
}

export function useParseScenario() {
  return useMutation({
    mutationFn: (text: string) => api.forecast.parse(text),
    onError: (e: Error) => toast.error(e.message ?? "Erro ao interpretar"),
  })
}

// ── Preferências ──────────────────────────────────────────────────────────────
export function useSettings() {
  return useQuery({
    queryKey: keys.settings.all,
    queryFn: api.settings.get,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.settings.update,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.settings.all })
      qc.invalidateQueries({ queryKey: keys.forecast.all })
      toast.success("Preferências salvas")
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao salvar"),
  })
}

// ── IA ────────────────────────────────────────────────────────────────────────
export function useLlmHealth() {
  return useQuery({
    queryKey: keys.llm.health(),
    queryFn: api.llm.health,
    staleTime: 60 * 1000,
    retry: false,
  })
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function useDashboardSummary(params: DashboardParams = {}) {
  return useQuery({
    queryKey: keys.dashboard.summary(params),
    queryFn: () => api.dashboard.summary(params),
  })
}
