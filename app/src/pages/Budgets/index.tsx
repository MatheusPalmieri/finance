import { useState } from "react"
import { Pencil, PiggyBank, Plus, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { BudgetModal } from "@/components/forms/BudgetModal"
import { ErrorState } from "@/components/ui/error-state"
import { useBudgets, useDeleteBudget } from "@/lib/queries"
import { formatCurrency } from "@/lib/format"
import {
  BUDGET_TYPE_HEX,
  BUDGET_TYPE_LABELS,
  BUDGET_TYPE_TARGET,
  type Budget,
  type BudgetType,
} from "@/types/finance"

const TYPE_ORDER: BudgetType[] = ["essential", "desire", "investment"]

// ── Página ────────────────────────────────────────────────────────────────────
export function Budgets() {
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [deleting, setDeleting] = useState<Budget | null>(null)

  const {
    data: budgets,
    isLoading,
    isError,
    refetch,
  } = useBudgets(search || undefined)
  const deleteMutation = useDeleteBudget()

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: budgets?.filter((b) => b.type === type) ?? [],
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">
            Planejamento de gastos pela regra 50/30/20
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm" className="gap-2">
          <Plus size={15} />
          Novo orçamento
        </Button>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search
          size={14}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          message="Não foi possível carregar os orçamentos."
          onRetry={() => refetch()}
        />
      ) : !budgets?.length ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <PiggyBank size={40} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {search
              ? "Nenhum orçamento encontrado"
              : "Nenhum orçamento cadastrado"}
          </p>
          {!search && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreating(true)}
            >
              Criar primeiro orçamento
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map(({ type, items }) =>
            items.length === 0 ? null : (
              <div key={type} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: BUDGET_TYPE_HEX[type] }}
                  />
                  <h2 className="text-sm font-semibold">
                    {BUDGET_TYPE_LABELS[type]}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    meta {BUDGET_TYPE_TARGET[type]}%
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((budget) => (
                    <BudgetCard
                      key={budget.id}
                      budget={budget}
                      onEdit={() => setEditing(budget)}
                      onDelete={() => setDeleting(budget)}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Modais */}
      {creating && (
        <BudgetModal
          open
          onClose={() => setCreating(false)}
          title="Novo orçamento"
        />
      )}

      {editing && (
        <BudgetModal
          open
          onClose={() => setEditing(null)}
          title="Editar orçamento"
          defaultValues={editing}
        />
      )}

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong> será removido permanentemente.
              Transações fixas vinculadas a ele ficarão sem orçamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleting)
                  deleteMutation.mutate(deleting.id, {
                    onSuccess: () => setDeleting(null),
                  })
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Texto do valor: fixo ou faixa mín–máx
function formatBudgetValue(budget: Budget) {
  if (budget.amountType === "fixed") return formatCurrency(budget.amount ?? 0)
  return `${formatCurrency(budget.amountMin ?? 0)} – ${formatCurrency(budget.amountMax ?? 0)}`
}

// ── Card ────────────────────────────────────────────────────────────────────────
function BudgetCard({
  budget,
  onEdit,
  onDelete,
}: {
  budget: Budget
  onEdit: () => void
  onDelete: () => void
}) {
  const color = BUDGET_TYPE_HEX[budget.type]

  return (
    <div className="group relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: color }}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{budget.name}</p>
          <span className="text-xs text-muted-foreground">
            {budget.amountType === "fixed" ? "Valor fixo" : "Valor variável"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar ${budget.name}`}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-7"
          >
            <Pencil size={15} className="lg:size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Excluir ${budget.name}`}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive lg:size-7"
          >
            <Trash2 size={15} className="lg:size-3.5" />
          </button>
        </div>
      </div>

      <p className="text-lg font-bold tabular-nums">
        {formatBudgetValue(budget)}
      </p>
    </div>
  )
}
