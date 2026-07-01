import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v4"
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Minus,
  Pencil,
  Plus,
  Repeat,
  Search,
  Trash2,
  X,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { FormModal } from "@/components/forms/FormModal"
import { ErrorState } from "@/components/ui/error-state"
import { BudgetCombobox } from "@/components/forms/BudgetCombobox"
import {
  useAccounts,
  useCategories,
  useCreateTransaction,
  useDefaultAccount,
  useDeleteTransaction,
  usePaymentMethods,
  useTransactions,
  useUpdateTransaction,
} from "@/lib/queries"
import { formatCurrency, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { FINANCE, tint } from "@/lib/tokens"
import { MONTHS, RECURRENCE_LABELS, type Recurrence, type Transaction } from "@/types/finance"

// Primeiro e último dia (ISO) do mês informado (1-indexado)
function monthRange(month: number, year: number) {
  const pad = (n: number) => String(n).padStart(2, "0")
  const from = `${year}-${pad(month)}-01`
  const to = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`
  return { from, to }
}

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z
  .object({
    name: z.string().min(1, "Informe o nome"),
    amount: z.number({ error: "Informe o valor" }).positive("Valor deve ser positivo"),
    isIncome: z.boolean(),
    categoryId: z.string().min(1, "Selecione a categoria"),
    paymentMethodId: z.string().min(1, "Selecione a forma de pagamento"),
    accountId: z.string().min(1, "Selecione a conta"),
    isEssential: z.boolean(),
    recurrence: z.enum(["fixed", "variable"]),
    budgetId: z.string().optional(),
    date: z.string().min(1, "Informe a data"),
    notes: z.string().optional(),
  })
  // Em gasto fixo, o orçamento vinculado é obrigatório
  .superRefine((val, ctx) => {
    if (val.recurrence === "fixed" && !val.budgetId) {
      ctx.addIssue({ code: "custom", path: ["budgetId"], message: "Selecione o orçamento vinculado" })
    }
  })

type FormValues = z.infer<typeof schema>

// ── Página ────────────────────────────────────────────────────────────────────
export function Transactions() {
  const now = new Date()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [filterCategoryId, setFilterCategoryId] = useState("")
  const [filterRecurrence, setFilterRecurrence] = useState<Recurrence | "">("")
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null)
  const [draftFrom, setDraftFrom] = useState("")
  const [draftTo, setDraftTo] = useState("")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)

  const { from, to } = customRange ?? monthRange(month, year)
  const isCurrentMonth = !customRange && month === now.getMonth() + 1 && year === now.getFullYear()
  const isSingleDay = customRange !== null && customRange.from === customRange.to

  function prevMonth() {
    setCustomRange(null)
    if (month === 1) { setMonth(12); setYear((y) => y - 1) } else setMonth((m) => m - 1)
    setPage(1)
  }
  function nextMonth() {
    setCustomRange(null)
    if (month === 12) { setMonth(1); setYear((y) => y + 1) } else setMonth((m) => m + 1)
    setPage(1)
  }
  function applyCustomRange() {
    if (!draftFrom || !draftTo) return
    // Se o usuário inverter as datas, normaliza para não quebrar o filtro
    const [rangeFrom, rangeTo] = draftFrom <= draftTo ? [draftFrom, draftTo] : [draftTo, draftFrom]
    setCustomRange({ from: rangeFrom, to: rangeTo })
    setPage(1)
  }
  function clearCustomRange() {
    setCustomRange(null)
    setPage(1)
  }

  const params = {
    page,
    limit: 30,
    search: search || undefined,
    categoryId: filterCategoryId || undefined,
    recurrence: filterRecurrence || undefined,
    from,
    to,
  }

  const { data, isLoading, isError, refetch } = useTransactions(params)
  const { data: categories } = useCategories()

  const deleteMutation = useDeleteTransaction()

  const grouped = groupByDate(data?.data ?? [])

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} {data?.total === 1 ? "transação registrada" : "transações registradas"}
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm" className="gap-2">
          <Plus size={15} />
          Nova transação
        </Button>
      </div>

      {/* Navegação por mês + período personalizado */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border bg-card px-1 py-1">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Mês anterior"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:size-7"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-27.5 text-center text-sm font-medium">
            {customRange
              ? isSingleDay
                ? formatDate(customRange.from)
                : `${formatDate(customRange.from)} – ${formatDate(customRange.to)}`
              : `${MONTHS[month - 1]} ${year}`}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            disabled={isCurrentMonth}
            aria-label="Próximo mês"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 sm:size-7"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <Popover onOpenChange={(open) => { if (open) { setDraftFrom(from); setDraftTo(to) } }}>
          <PopoverTrigger asChild>
            <Button variant={customRange ? "default" : "outline"} size="sm" className="gap-2">
              <CalendarRange size={14} />
              Período específico
            </Button>
          </PopoverTrigger>
          <PopoverContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>De</Label>
              <Input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Até</Label>
              <Input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Para um dia específico, use a mesma data em "De" e "Até".
            </p>
            <Button size="sm" onClick={applyCustomRange} disabled={!draftFrom || !draftTo}>
              Aplicar
            </Button>
          </PopoverContent>
        </Popover>

        {customRange && (
          <button
            type="button"
            onClick={clearCustomRange}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={12} />
            Voltar para navegação por mês
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        <Select
          value={filterCategoryId || "all"}
          onValueChange={(v) => { setFilterCategoryId(v === "all" ? "" : v); setPage(1) }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterRecurrence || "all"}
          onValueChange={(v) => { setFilterRecurrence(v === "all" ? "" : (v as Recurrence)); setPage(1) }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Recorrência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda recorrência</SelectItem>
            <SelectItem value="fixed">Fixo</SelectItem>
            <SelectItem value="variable">Variável</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar as transações." onRetry={() => refetch()} />
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-muted-foreground">Nenhuma transação encontrada</p>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            Criar primeira transação
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(([date, txs]) => (
            <div key={date}>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {formatDate(date)}
              </p>
              <div className="divide-y divide-border rounded-xl border bg-card">
                {txs.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    onEdit={() => setEditing(tx)}
                    onDelete={() => setDeleting(tx)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Paginação */}
          {data && data.total > data.limit && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {Math.ceil(data.total / data.limit)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(data.total / data.limit)}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Modais */}
      {creating && <TransactionModal open onClose={() => setCreating(false)} title="Nova transação" />}

      {editing && (
        <TransactionModal
          open
          onClose={() => setEditing(null)}
          title="Editar transação"
          defaultValues={editing}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong> será removida permanentemente e o valor será
              devolvido ao saldo da conta.
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

// ── Linha de transação ────────────────────────────────────────────────────────
function TransactionRow({
  tx,
  onEdit,
  onDelete,
}: {
  tx: Transaction
  onEdit: () => void
  onDelete: () => void
}) {
  const amount = Number(tx.amount)
  const isIncome = amount < 0
  const color = isIncome ? FINANCE.income : (tx.category?.color ?? FINANCE.neutral)

  return (
    <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
      {/* Ícone com a cor da categoria (ou verde para entrada) */}
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: tint(color) }}
      >
        {isIncome ? <ArrowUpRight size={14} style={{ color }} /> : <ArrowDownRight size={14} style={{ color }} />}
      </div>

      {/* Nome e meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{tx.name}</p>
          {tx.isEssential && (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              Essencial
            </span>
          )}
          <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
            {tx.recurrence === "fixed" ? <Repeat size={10} /> : <Zap size={10} />}
            {RECURRENCE_LABELS[tx.recurrence]}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {tx.category?.name ?? "Sem categoria"} · {tx.paymentMethod?.name ?? "—"} · {tx.account?.name ?? "—"}
        </p>
      </div>

      {/* Valor (despesa ou entrada) */}
      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
          isIncome && "text-emerald-600 dark:text-emerald-400"
        )}
      >
        {isIncome ? "+" : "−"}{formatCurrency(Math.abs(amount))}
      </span>

      {/* Ações: sempre visíveis no toque, reveladas no hover no desktop */}
      <div className="flex shrink-0 items-center gap-1 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          aria-label="Editar transação"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-7"
        >
          <Pencil size={15} className="lg:size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Excluir transação"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive lg:size-7"
        >
          <Trash2 size={15} className="lg:size-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Modal de criar/editar ─────────────────────────────────────────────────────
function TransactionModal({
  open,
  onClose,
  title,
  defaultValues,
}: {
  open: boolean
  onClose: () => void
  title: string
  defaultValues?: Transaction
}) {
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const { data: paymentMethods } = usePaymentMethods()
  const { data: defaultAccount } = useDefaultAccount()
  const create = useCreateTransaction()
  const update = useUpdateTransaction()

  const today = new Date().toISOString().split("T")[0]

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
          amount: Math.abs(Number(defaultValues.amount)),
          isIncome: Number(defaultValues.amount) < 0,
          categoryId: defaultValues.categoryId,
          paymentMethodId: defaultValues.paymentMethodId,
          accountId: defaultValues.accountId,
          isEssential: defaultValues.isEssential,
          recurrence: defaultValues.recurrence,
          budgetId: defaultValues.budgetId ?? undefined,
          date: defaultValues.date,
          notes: defaultValues.notes ?? undefined,
        }
      : {
          isEssential: true,
          isIncome: false,
          recurrence: "variable",
          date: today,
          accountId: defaultAccount?.id ?? "",
        },
  })

  const isEssential = watch("isEssential")
  const isIncome = watch("isIncome")
  const recurrence = watch("recurrence")

  const onSubmit = handleSubmit(({ isIncome: income, amount, ...values }) => {
    const payload = {
      ...values,
      amount: income ? -amount : amount,
      budgetId: values.recurrence === "fixed" ? values.budgetId : null,
      notes: values.notes || null,
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
      formId="transaction-form"
      onSubmit={onSubmit}
      isPending={isPending}
    >
      <div className="flex flex-col gap-4 py-1">
        {/* Nome */}
        <div className="flex flex-col gap-1.5">
          <Label>Nome</Label>
          <Input placeholder="Ex: Supermercado" autoFocus {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        {/* Valor e data */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Valor (R$)</Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setValue("isIncome", !isIncome)}
                aria-pressed={isIncome}
                aria-label={isIncome ? "Entrada — clique para marcar como despesa" : "Despesa — clique para marcar como entrada"}
                title={isIncome ? "Entrada — clique para marcar como despesa" : "Despesa — clique para marcar como entrada"}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-white transition-colors"
                style={{ backgroundColor: isIncome ? FINANCE.income : FINANCE.expense }}
              >
                {isIncome ? <Plus size={16} /> : <Minus size={16} />}
              </button>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                className="flex-1"
                {...register("amount", { valueAsNumber: true })}
              />
            </div>
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Data</Label>
            <Input type="date" {...register("date")} />
            {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
          </div>
        </div>

        {/* Categoria */}
        <div className="flex flex-col gap-1.5">
          <Label>Categoria</Label>
          <Select value={watch("categoryId") ?? ""} onValueChange={(v) => setValue("categoryId", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              {categories?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.categoryId && <p className="text-xs text-destructive">{errors.categoryId.message}</p>}
        </div>

        {/* Forma de pagamento e conta */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Forma de pagamento</Label>
            <Select value={watch("paymentMethodId") ?? ""} onValueChange={(v) => setValue("paymentMethodId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.paymentMethodId && (
              <p className="text-xs text-destructive">{errors.paymentMethodId.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Conta</Label>
            <Select value={watch("accountId") ?? ""} onValueChange={(v) => setValue("accountId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {accounts?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.accountId && <p className="text-xs text-destructive">{errors.accountId.message}</p>}
          </div>
        </div>

        {/* Essencial */}
        <div className="flex flex-col gap-1.5">
          <Label>Tipo de gasto</Label>
          <div className="flex gap-2">
            <SegButton active={isEssential} onClick={() => setValue("isEssential", true)} color={FINANCE.essential}>
              Essencial
            </SegButton>
            <SegButton active={!isEssential} onClick={() => setValue("isEssential", false)} color={FINANCE.nonEssential}>
              Não essencial
            </SegButton>
          </div>
        </div>

        {/* Recorrência */}
        <div className="flex flex-col gap-1.5">
          <Label>Recorrência</Label>
          <div className="flex gap-2">
            <SegButton active={recurrence === "fixed"} onClick={() => setValue("recurrence", "fixed")} color={FINANCE.fixed}>
              Fixo
            </SegButton>
            <SegButton
              active={recurrence === "variable"}
              onClick={() => { setValue("recurrence", "variable"); setValue("budgetId", undefined) }}
              color={FINANCE.variable}
            >
              Variável
            </SegButton>
          </div>
        </div>

        {/* Orçamento vinculado (apenas gasto fixo) */}
        {recurrence === "fixed" && (
          <div className="flex flex-col gap-1.5">
            <Label>Orçamento vinculado</Label>
            <BudgetCombobox
              value={watch("budgetId")}
              onChange={(id) => setValue("budgetId", id, { shouldValidate: true })}
              selectedName={defaultValues?.budget?.name}
              hasError={!!errors.budgetId}
            />
            {errors.budgetId && <p className="text-xs text-destructive">{errors.budgetId.message}</p>}
          </div>
        )}

        {/* Observações */}
        <div className="flex flex-col gap-1.5">
          <Label>Observações (opcional)</Label>
          <textarea
            rows={2}
            placeholder="Detalhes adicionais..."
            className="w-full resize-none rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            {...register("notes")}
          />
        </div>
      </div>
    </FormModal>
  )
}

// Botão segmentado para escolhas binárias do formulário
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

// Agrupa transações por data (ISO yyyy-mm-dd), preservando a ordem já vinda da API
function groupByDate(txs: Transaction[]): [string, Transaction[]][] {
  const map = new Map<string, Transaction[]>()
  for (const tx of txs) {
    const list = map.get(tx.date)
    if (list) list.push(tx)
    else map.set(tx.date, [tx])
  }
  return Array.from(map.entries())
}
