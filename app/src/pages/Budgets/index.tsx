import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v4"
import { Pencil, PiggyBank, Plus, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { FormModal } from "@/components/forms/FormModal"
import { ErrorState } from "@/components/ui/error-state"
import { useCreateBudget, useBudgets, useDeleteBudget, useUpdateBudget } from "@/lib/queries"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { FINANCE } from "@/lib/tokens"
import {
  BUDGET_TYPE_HEX,
  BUDGET_TYPE_LABELS,
  BUDGET_TYPE_TARGET,
  type Budget,
  type BudgetType,
} from "@/types/finance"

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z
  .object({
    name: z.string().min(1, "Informe o nome"),
    type: z.enum(["essential", "desire", "investment"]),
    amountType: z.enum(["fixed", "variable"]),
    amount: z.number().positive("Valor deve ser positivo").optional(),
    amountMin: z.number().positive("Valor deve ser positivo").optional(),
    amountMax: z.number().positive("Valor deve ser positivo").optional(),
  })
  .superRefine((val, ctx) => {
    if (val.amountType === "fixed") {
      if (val.amount == null)
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Informe o valor" })
    } else {
      if (val.amountMin == null)
        ctx.addIssue({ code: "custom", path: ["amountMin"], message: "Informe o mínimo" })
      if (val.amountMax == null)
        ctx.addIssue({ code: "custom", path: ["amountMax"], message: "Informe o máximo" })
      if (val.amountMin != null && val.amountMax != null && val.amountMin >= val.amountMax)
        ctx.addIssue({ code: "custom", path: ["amountMax"], message: "Máximo deve ser maior que o mínimo" })
    }
  })

type FormValues = z.infer<typeof schema>

const TYPE_ORDER: BudgetType[] = ["essential", "desire", "investment"]

// ── Página ────────────────────────────────────────────────────────────────────
export function Budgets() {
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [deleting, setDeleting] = useState<Budget | null>(null)

  const { data: budgets, isLoading, isError, refetch } = useBudgets(search || undefined)
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
        <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar os orçamentos." onRetry={() => refetch()} />
      ) : !budgets?.length ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <PiggyBank size={40} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {search ? "Nenhum orçamento encontrado" : "Nenhum orçamento cadastrado"}
          </p>
          {!search && (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
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
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: BUDGET_TYPE_HEX[type] }} />
                  <h2 className="text-sm font-semibold">{BUDGET_TYPE_LABELS[type]}</h2>
                  <span className="text-xs text-muted-foreground">meta {BUDGET_TYPE_TARGET[type]}%</span>
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
      {creating && <BudgetModal open onClose={() => setCreating(false)} title="Novo orçamento" />}

      {editing && (
        <BudgetModal open onClose={() => setEditing(null)} title="Editar orçamento" defaultValues={editing} />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong> será removido permanentemente. Transações fixas
              vinculadas a ele ficarão sem orçamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting) deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
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
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />

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

      <p className="text-lg font-bold tabular-nums">{formatBudgetValue(budget)}</p>
    </div>
  )
}

// ── Modal de criar/editar ─────────────────────────────────────────────────────
function BudgetModal({
  open,
  onClose,
  title,
  defaultValues,
}: {
  open: boolean
  onClose: () => void
  title: string
  defaultValues?: Budget
}) {
  const create = useCreateBudget()
  const update = useUpdateBudget()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues
      ? {
          name: defaultValues.name,
          type: defaultValues.type,
          amountType: defaultValues.amountType,
          amount: defaultValues.amount ? Number(defaultValues.amount) : undefined,
          amountMin: defaultValues.amountMin ? Number(defaultValues.amountMin) : undefined,
          amountMax: defaultValues.amountMax ? Number(defaultValues.amountMax) : undefined,
        }
      : { type: "essential", amountType: "fixed" },
  })

  const amountType = watch("amountType")

  const onSubmit = handleSubmit((values) => {
    const payload =
      values.amountType === "fixed"
        ? { name: values.name, type: values.type, amountType: "fixed" as const, amount: values.amount }
        : {
            name: values.name,
            type: values.type,
            amountType: "variable" as const,
            amountMin: values.amountMin,
            amountMax: values.amountMax,
          }

    const finish = () => { onClose(); reset() }
    if (defaultValues) {
      update.mutate({ id: defaultValues.id, ...payload }, { onSuccess: finish })
    } else {
      create.mutate(payload, { onSuccess: finish })
    }
  })

  const isPending = create.isPending || update.isPending

  return (
    <FormModal
      open={open}
      onClose={() => { onClose(); reset() }}
      title={title}
      formId="budget-form"
      onSubmit={onSubmit}
      isPending={isPending}
    >
      <div className="flex flex-col gap-4 py-1">
        {/* Nome */}
        <div className="flex flex-col gap-1.5">
          <Label>Nome</Label>
          <Input placeholder="Ex: Aluguel" autoFocus {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        {/* Tipo (50/30/20) */}
        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <Select value={watch("type")} onValueChange={(v) => setValue("type", v as BudgetType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_ORDER.map((type) => (
                <SelectItem key={type} value={type}>
                  {BUDGET_TYPE_LABELS[type]} ({BUDGET_TYPE_TARGET[type]}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Forma do valor */}
        <div className="flex flex-col gap-1.5">
          <Label>Forma do valor</Label>
          <div className="flex gap-2">
            <SegButton active={amountType === "fixed"} onClick={() => setValue("amountType", "fixed")} color={FINANCE.fixed}>
              Fixo
            </SegButton>
            <SegButton active={amountType === "variable"} onClick={() => setValue("amountType", "variable")} color={FINANCE.variable}>
              Variável (faixa)
            </SegButton>
          </div>
        </div>

        {/* Valor(es) conforme a forma */}
        {amountType === "fixed" ? (
          <div className="flex flex-col gap-1.5">
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" min="0.01" placeholder="0,00" {...register("amount", { valueAsNumber: true })} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Mínimo (R$)</Label>
              <Input type="number" step="0.01" min="0.01" placeholder="0,00" {...register("amountMin", { valueAsNumber: true })} />
              {errors.amountMin && <p className="text-xs text-destructive">{errors.amountMin.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Máximo (R$)</Label>
              <Input type="number" step="0.01" min="0.01" placeholder="0,00" {...register("amountMax", { valueAsNumber: true })} />
              {errors.amountMax && <p className="text-xs text-destructive">{errors.amountMax.message}</p>}
            </div>
          </div>
        )}
      </div>
    </FormModal>
  )
}

// Botão segmentado para escolhas binárias
function SegButton({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean
  onClick: () => void
  color: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center rounded-lg border py-2 text-xs font-medium transition-colors",
        active ? "border-transparent text-white" : "text-muted-foreground hover:text-foreground"
      )}
      style={active ? { backgroundColor: color } : {}}
    >
      {children}
    </button>
  )
}
