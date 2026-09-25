import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v4"
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  Info,
  Landmark,
  Pencil,
  PiggyBank,
  Repeat,
  RotateCcw,
  Search,
  X,
  Zap,
} from "lucide-react"
import { Link } from "react-router-dom"
import { usePeriod } from "@/components/period-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { FormModal } from "@/components/forms/FormModal"
import { ErrorState } from "@/components/ui/error-state"
import { BudgetCombobox } from "@/components/forms/BudgetCombobox"
import {
  BudgetModal,
  type BudgetFormValues,
} from "@/components/forms/BudgetModal"
import {
  useCategories,
  useReclassifyTransaction,
  useTransactions,
} from "@/lib/queries"
import { formatCurrency, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { FINANCE, tint } from "@/lib/tokens"
import {
  MONTHS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
  RECURRENCE_LABELS,
  TRANSACTION_KIND_LABELS,
  type PaymentMethod,
  type Recurrence,
  type Transaction,
} from "@/types/finance"

// Primeiro e último dia (ISO) do mês informado (1-indexado)
function monthRange(month: number, year: number) {
  const pad = (n: number) => String(n).padStart(2, "0")
  const from = `${year}-${pad(month)}-01`
  const to = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`
  return { from, to }
}

// ── Schema ────────────────────────────────────────────────────────────────────
// Só a classificação é do usuário. Valor, data e conta vêm do banco via Open
// Finance e aparecem como leitura no modal.
const schema = z
  .object({
    name: z.string().min(1, "Informe o nome"),
    categoryId: z.string().min(1, "Selecione a categoria"),
    isEssential: z.boolean(),
    recurrence: z.enum(["fixed", "variable"]),
    budgetId: z.string().optional(),
    notes: z.string().optional(),
  })
  // Em gasto fixo, o orçamento vinculado é obrigatório
  .superRefine((val, ctx) => {
    if (val.recurrence === "fixed" && !val.budgetId) {
      ctx.addIssue({
        code: "custom",
        path: ["budgetId"],
        message: "Selecione o orçamento vinculado",
      })
    }
  })

type FormValues = z.infer<typeof schema>

// ── Página ────────────────────────────────────────────────────────────────────
export function Transactions() {
  const { month, year } = usePeriod()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [filterCategoryId, setFilterCategoryId] = useState("")
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<
    PaymentMethod | ""
  >("")
  const [filterRecurrence, setFilterRecurrence] = useState<Recurrence | "">("")
  const [order, setOrder] = useState<"asc" | "desc">("desc")
  const [customRange, setCustomRange] = useState<{
    from: string
    to: string
  } | null>(null)
  const [draftFrom, setDraftFrom] = useState("")
  const [draftTo, setDraftTo] = useState("")
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [converting, setConverting] = useState<Transaction | null>(null)

  const { from, to } = customRange ?? monthRange(month, year)
  const isSingleDay =
    customRange !== null && customRange.from === customRange.to

  // Trocar o mês global volta à primeira página e descarta o período específico
  const periodKey = `${year}-${month}`
  const [lastPeriodKey, setLastPeriodKey] = useState(periodKey)
  if (lastPeriodKey !== periodKey) {
    setLastPeriodKey(periodKey)
    setCustomRange(null)
    setPage(1)
  }

  function applyCustomRange() {
    if (!draftFrom || !draftTo) return
    // Se o usuário inverter as datas, normaliza para não quebrar o filtro
    const [rangeFrom, rangeTo] =
      draftFrom <= draftTo ? [draftFrom, draftTo] : [draftTo, draftFrom]
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
    paymentMethod: filterPaymentMethod || undefined,
    recurrence: filterRecurrence || undefined,
    from,
    to,
    order,
  }

  const { data, isLoading, isError, refetch } = useTransactions(params)
  const { data: categories } = useCategories()

  const grouped = groupByDate(data?.data ?? [])

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0}{" "}
            {data?.total === 1
              ? "transação do Open Finance"
              : "transações do Open Finance"}
          </p>
        </div>
      </div>

      {/* Navegação por mês + período personalizado */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">
          {customRange
            ? isSingleDay
              ? formatDate(customRange.from)
              : `${formatDate(customRange.from)} – ${formatDate(customRange.to)}`
            : `${MONTHS[month - 1]} ${year}`}
        </span>

        <Popover
          onOpenChange={(open) => {
            if (open) {
              setDraftFrom(from)
              setDraftTo(to)
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant={customRange ? "default" : "outline"}
              size="sm"
              className="gap-2"
            >
              <CalendarRange size={14} />
              Período específico
            </Button>
          </PopoverTrigger>
          <PopoverContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>De</Label>
              <Input
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Até</Label>
              <Input
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Para um dia específico, use a mesma data em "De" e "Até".
            </p>
            <Button
              size="sm"
              onClick={applyCustomRange}
              disabled={!draftFrom || !draftTo}
            >
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
            Voltar para o mês selecionado
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={filterCategoryId || "all"}
          onValueChange={(v) => {
            setFilterCategoryId(v === "all" ? "" : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterPaymentMethod || "all"}
          onValueChange={(v) => {
            setFilterPaymentMethod(v === "all" ? "" : (v as PaymentMethod))
            setPage(1)
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Forma de pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os pagamentos</SelectItem>
            {PAYMENT_METHOD_ORDER.map((p) => (
              <SelectItem key={p} value={p}>
                {PAYMENT_METHOD_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterRecurrence || "all"}
          onValueChange={(v) => {
            setFilterRecurrence(v === "all" ? "" : (v as Recurrence))
            setPage(1)
          }}
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

        <Select
          value={order}
          onValueChange={(v) => {
            setOrder(v as "asc" | "desc")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Mais recentes primeiro</SelectItem>
            <SelectItem value="asc">Mais antigas primeiro</SelectItem>
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
        <ErrorState
          message="Não foi possível carregar as transações."
          onRetry={() => refetch()}
        />
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-muted-foreground">Nenhuma transação encontrada</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            As transações chegam só pelo Open Finance. Se faltar algo, rode uma
            sincronização.
          </p>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link to="/open-finance">
              <Landmark size={14} />
              Ir para o Open Finance
            </Link>
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
                    onConvertToBudget={() => setConverting(tx)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Paginação */}
          {data && data.total > data.limit && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
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

      {editing && (
        <ClassificationModal
          open
          onClose={() => setEditing(null)}
          transaction={editing}
        />
      )}

      {converting && (
        <BudgetModal
          open
          onClose={() => setConverting(null)}
          title="Converter em orçamento"
          submitLabel="Criar orçamento"
          initialValues={budgetFromTransaction(converting)}
        />
      )}
    </div>
  )
}

// Pré-preenche o orçamento com o que a transação já diz: nome (ou o nome
// original do banco), valor absoluto, fixo/variável e se é essencial
function budgetFromTransaction(tx: Transaction): Partial<BudgetFormValues> {
  const amount = Math.abs(Number(tx.amount))
  return {
    name: tx.name || tx.originalName || "",
    type: tx.isEssential ? "essential" : "desire",
    amountType: "fixed",
    amount: amount > 0 ? amount : undefined,
  }
}

// ── Linha de transação ────────────────────────────────────────────────────────
function TransactionRow({
  tx,
  onEdit,
  onConvertToBudget,
}: {
  tx: Transaction
  onEdit: () => void
  onConvertToBudget: () => void
}) {
  const amount = Number(tx.amount)
  const isIncome = amount < 0
  const color = isIncome
    ? FINANCE.income
    : (tx.category?.color ?? FINANCE.neutral)

  return (
    <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
      {/* Ícone com a cor da categoria (ou verde para entrada) */}
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: tint(color) }}
      >
        {isIncome ? (
          <ArrowUpRight size={14} style={{ color }} />
        ) : (
          <ArrowDownRight size={14} style={{ color }} />
        )}
      </div>

      {/* Nome e meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{tx.name}</p>
          {!isIncome && tx.isEssential && (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              Essencial
            </span>
          )}
          <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
            {tx.recurrence === "fixed" ? (
              <Repeat size={10} />
            ) : (
              <Zap size={10} />
            )}
            {RECURRENCE_LABELS[tx.recurrence]}
          </span>
          {tx.status === "pending" && (
            <span
              className="shrink-0 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400"
              title="Ainda não lançada pelo banco (fatura aberta ou parcela futura)"
            >
              Pendente
            </span>
          )}
          {tx.kind !== "regular" && (
            <span
              className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title={`${TRANSACTION_KIND_LABELS[tx.kind]} — dinheiro mudando de lugar; fica fora do dashboard, check-up e projeção`}
            >
              Interno
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {tx.category?.name ?? "Sem categoria"} ·{" "}
          {PAYMENT_METHOD_LABELS[tx.paymentMethod]} · {tx.account?.name ?? "—"}
        </p>
      </div>

      {/* Valor (despesa ou entrada) */}
      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
          isIncome
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
        )}
      >
        {isIncome && "+"}
        {formatCurrency(Math.abs(amount))}
      </span>

      {/* Ação: sempre visível no toque, revelada no hover no desktop */}
      <div className="flex shrink-0 items-center gap-1 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
        {!isIncome && (
          <button
            type="button"
            onClick={onConvertToBudget}
            aria-label="Converter em orçamento"
            title="Converter em orçamento"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-7"
          >
            <PiggyBank size={15} className="lg:size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          aria-label="Reclassificar transação"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-7"
        >
          <Pencil size={15} className="lg:size-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Modal de reclassificação ──────────────────────────────────────────────────
function ClassificationModal({
  open,
  onClose,
  transaction,
}: {
  open: boolean
  onClose: () => void
  transaction: Transaction
}) {
  const { data: categories } = useCategories()
  const reclassify = useReclassifyTransaction()

  const amount = Number(transaction.amount)
  const isIncome = amount < 0

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: transaction.name,
      categoryId: transaction.categoryId,
      isEssential: transaction.isEssential,
      recurrence: transaction.recurrence,
      budgetId: transaction.budgetId ?? undefined,
      notes: transaction.notes ?? undefined,
    },
  })

  const isEssential = watch("isEssential")
  const recurrence = watch("recurrence")
  // Só oferece reverter quando o nome atual difere do oficial do banco
  const currentName = watch("name")
  const canRestoreName =
    !!transaction.originalName && currentName !== transaction.originalName

  const onSubmit = handleSubmit((values) => {
    reclassify.mutate(
      {
        id: transaction.id,
        ...values,
        // Essencial só existe em saída — entrada é sempre gravada como não essencial
        isEssential: isIncome ? false : values.isEssential,
        budgetId: values.recurrence === "fixed" ? values.budgetId : null,
        notes: values.notes || null,
      },
      {
        onSuccess: () => {
          onClose()
          reset()
        },
      }
    )
  })

  return (
    <FormModal
      open={open}
      onClose={() => {
        onClose()
        reset()
      }}
      title="Reclassificar transação"
      formId="transaction-form"
      onSubmit={onSubmit}
      isPending={reclassify.isPending}
      footerStart={
        canRestoreName && (
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setValue("name", transaction.originalName!, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            title={`Nome do banco: ${transaction.originalName}`}
          >
            <RotateCcw size={14} />
            Restaurar nome
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4 py-1">
        {/* O que veio do banco: só leitura */}
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {formatDate(transaction.date)} ·{" "}
              {transaction.account?.name ?? "—"} ·{" "}
              {PAYMENT_METHOD_LABELS[transaction.paymentMethod]}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Valor, data, conta e forma de pagamento vêm do Open Finance
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 text-sm font-semibold tabular-nums",
              isIncome
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {isIncome && "+"}
            {formatCurrency(Math.abs(amount))}
          </span>
        </div>

        {/* Nome */}
        <div className="flex flex-col gap-1.5">
          <Label>Nome</Label>
          <Input
            placeholder="Ex: Supermercado"
            autoFocus
            {...register("name")}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        {/* Categoria */}
        <div className="flex flex-col gap-1.5">
          <Label>Categoria</Label>
          <Select
            value={watch("categoryId") ?? ""}
            onValueChange={(v) => setValue("categoryId", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              {categories?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.categoryId && (
            <p className="text-xs text-destructive">
              {errors.categoryId.message}
            </p>
          )}
        </div>

        {/* Tipo de gasto (só saídas) e recorrência, lado a lado */}
        <TooltipProvider delayDuration={150}>
          <div className="grid grid-cols-2 gap-3">
            {!isIncome && (
              <ToggleField
                id="tx-essential"
                label="Tipo de gasto"
                help="Essencial é o que você não consegue cortar (moradia, mercado, saúde). Não essencial é o que dá para reduzir ou evitar — entra na fatia de desejos do 50/30/20."
                checked={isEssential}
                onCheckedChange={(v) => setValue("isEssential", v)}
                onText="Essencial"
                offText="Não essencial"
                onColor={FINANCE.essential}
                offColor={FINANCE.nonEssential}
              />
            )}
            <ToggleField
              id="tx-recurrence"
              label="Recorrência"
              help="Fixo se repete todo mês com valor parecido (aluguel, assinaturas) e pode ser vinculado a um orçamento. Variável muda de mês a mês (lazer, compras avulsas)."
              checked={recurrence === "fixed"}
              onCheckedChange={(v) => {
                setValue("recurrence", v ? "fixed" : "variable")
                if (!v) setValue("budgetId", undefined)
              }}
              onText="Fixo"
              offText="Variável"
              onColor={FINANCE.fixed}
              offColor={FINANCE.variable}
            />
          </div>
        </TooltipProvider>

        {/* Orçamento vinculado (apenas gasto fixo) */}
        {recurrence === "fixed" && (
          <div className="flex flex-col gap-1.5">
            <Label>Orçamento vinculado</Label>
            <BudgetCombobox
              value={watch("budgetId")}
              onChange={(id) =>
                setValue("budgetId", id, { shouldValidate: true })
              }
              selectedName={transaction.budget?.name}
              hasError={!!errors.budgetId}
            />
            {errors.budgetId && (
              <p className="text-xs text-destructive">
                {errors.budgetId.message}
              </p>
            )}
          </div>
        )}

        {/* Observações */}
        <div className="flex flex-col gap-1.5">
          <Label>Observações (opcional)</Label>
          <textarea
            rows={2}
            placeholder="Detalhes adicionais..."
            className="w-full resize-none rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            {...register("notes")}
          />
        </div>
      </div>
    </FormModal>
  )
}

// Escolha binária do formulário: toggle buttons + tooltip de ajuda
function ToggleField({
  id,
  label,
  help,
  checked,
  onCheckedChange,
  onText,
  offText,
  onColor,
  offColor,
}: {
  id: string
  label: string
  help: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  onText: string
  offText: string
  onColor: string
  offColor: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <Label id={`${id}-label`}>{label}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`O que é ${label.toLowerCase()}?`}
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            >
              <Info size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-60">
            {help}
          </TooltipContent>
        </Tooltip>
      </div>
      <ToggleGroup
        aria-labelledby={`${id}-label`}
        type="single"
        variant="outline"
        spacing={0}
        className="w-full"
        value={checked ? "on" : "off"}
        // Radix permite desmarcar o item ativo; ignora para sempre haver um valor
        onValueChange={(v) => v && onCheckedChange(v === "on")}
      >
        {(
          [
            ["on", onText, onColor],
            ["off", offText, offColor],
          ] as const
        ).map(([value, text, color]) => {
          const active = checked === (value === "on")
          return (
            <ToggleGroupItem
              key={value}
              value={value}
              size="sm"
              className={cn(
                "flex-1 text-xs",
                active
                  ? "border-transparent text-white hover:text-white"
                  : "text-muted-foreground"
              )}
              style={active ? { backgroundColor: color } : undefined}
            >
              {text}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </div>
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
