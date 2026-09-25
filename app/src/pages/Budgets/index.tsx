import { useState, type ReactNode } from "react"
import {
  ChevronDown,
  Pencil,
  PiggyBank,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
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
import { usePeriod } from "@/components/period-provider"
import { useBudgetSummary, useBudgets, useDeleteBudget } from "@/lib/queries"
import { formatCurrency } from "@/lib/format"
import { FINANCE, PALETTE, tint } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import {
  BUDGET_GROUP_LABELS,
  BUDGET_TYPE_HEX,
  BUDGET_TYPE_TARGET,
  type Budget,
  type BudgetSummary,
  type BudgetType,
} from "@/types/finance"

const TYPE_ORDER: BudgetType[] = ["essential", "desire", "investment"]

// Como uma faixa (mín–máx) entra nos totais
type RangeMode = "mid" | "min" | "max"

const RANGE_MODES: { value: RangeMode; label: string }[] = [
  { value: "min", label: "Mínimo" },
  { value: "mid", label: "Médio" },
  { value: "max", label: "Máximo" },
]

// Valor planejado do orçamento; valor exato ignora o modo
function plannedValue(budget: Budget, mode: RangeMode) {
  if (budget.amountType === "fixed") return Number(budget.amount ?? 0)
  const min = Number(budget.amountMin ?? 0)
  const max = Number(budget.amountMax ?? 0)
  if (mode === "min") return min
  if (mode === "max") return max
  return (min + max) / 2
}

// Texto do valor: exato ou faixa mín–máx
function formatBudgetValue(budget: Budget) {
  if (budget.amountType === "fixed") return formatCurrency(budget.amount ?? 0)
  return `${formatCurrency(budget.amountMin ?? 0)} – ${formatCurrency(budget.amountMax ?? 0)}`
}

function pct(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
}

// ── Página ────────────────────────────────────────────────────────────────────
export function Budgets() {
  const { month, year } = usePeriod()
  const [search, setSearch] = useState("")
  const [rangeMode, setRangeMode] = useState<RangeMode>("mid")
  const [collapsed, setCollapsed] = useState<Set<BudgetType>>(new Set())
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [deleting, setDeleting] = useState<Budget | null>(null)

  // Lista completa: o resumo precisa de todos; a busca filtra só a tabela
  const { data: budgets, isLoading, isError, refetch } = useBudgets()
  const summary = useBudgetSummary({ month, year })
  const deleteMutation = useDeleteBudget()

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })

  const plannedByType = Object.fromEntries(
    TYPE_ORDER.map((type) => [
      type,
      (budgets ?? [])
        .filter((b) => b.type === type)
        .reduce((sum, b) => sum + plannedValue(b, rangeMode), 0),
    ])
  ) as Record<BudgetType, number>

  const query = search.trim().toLowerCase()
  const groups = TYPE_ORDER.map((type) => ({
    type,
    items: (budgets ?? []).filter(
      (b) => b.type === type && b.name.toLowerCase().includes(query)
    ),
  }))
  const hasRange = budgets?.some((b) => b.amountType === "variable") ?? false

  function toggleGroup(type: BudgetType) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orçamentos</h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {monthLabel} · plano pela regra 50/30/20
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasRange && (
            <div className="flex items-center gap-2">
              <span
                id="range-mode-label"
                className="text-xs text-muted-foreground"
              >
                Faixas pelo
              </span>
              <ToggleGroup
                aria-labelledby="range-mode-label"
                type="single"
                variant="outline"
                spacing={0}
                size="sm"
                value={rangeMode}
                // Radix permite desmarcar o item ativo; ignora para sempre haver um valor
                onValueChange={(v) => v && setRangeMode(v as RangeMode)}
              >
                {RANGE_MODES.map(({ value, label }) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    className="px-3 text-xs"
                  >
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
          <Button onClick={() => setCreating(true)} size="sm" className="gap-2">
            <Plus size={15} />
            Novo orçamento
          </Button>
        </div>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : isError ? (
        <ErrorState
          message="Não foi possível carregar os orçamentos."
          onRetry={() => refetch()}
        />
      ) : !budgets?.length ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <PiggyBank size={40} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">Nenhum orçamento cadastrado</p>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            Criar primeiro orçamento
          </Button>
        </div>
      ) : (
        <>
          <SummaryCard
            plannedByType={plannedByType}
            summary={summary.data}
            isLoading={summary.isLoading}
            isError={summary.isError}
            onRetry={() => summary.refetch()}
          />

          {/* Lista compacta agrupada */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Itens do plano</h2>
              <div className="relative w-full max-w-xs">
                <Search
                  size={14}
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  placeholder="Buscar por nome..."
                  aria-label="Buscar orçamento"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {groups.every((g) => g.items.length === 0) ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhum orçamento encontrado
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                      <th className="px-4 py-2.5 font-semibold">Nome</th>
                      <th className="px-4 py-2.5 font-semibold">Valor</th>
                      <th className="px-4 py-2.5 text-right font-semibold">
                        Planejado
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold">
                        Gasto no mês
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold">
                        Do grupo
                      </th>
                      <th className="w-20 px-4 py-2.5">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  {groups.map(({ type, items }) =>
                    items.length === 0 ? null : (
                      <BudgetGroup
                        key={type}
                        type={type}
                        items={items}
                        // Buscando, os grupos ficam abertos para mostrar o resultado
                        open={!collapsed.has(type) || query !== ""}
                        onToggle={() => toggleGroup(type)}
                        groupPlanned={plannedByType[type]}
                        groupSpent={summary.data?.spentByType[type]}
                        spentByBudget={summary.data?.spentByBudget}
                        rangeMode={rangeMode}
                        onEdit={setEditing}
                        onDelete={setDeleting}
                      />
                    )
                  )}
                </table>
              </div>
            )}
          </section>
        </>
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
              Transações recorrentes vinculadas a ele ficarão sem orçamento.
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

// ── Resumo: plano vs meta e realizado do mês ──────────────────────────────────
function SummaryCard({
  plannedByType,
  summary,
  isLoading,
  isError,
  onRetry,
}: {
  plannedByType: Record<BudgetType, number>
  summary: BudgetSummary | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}) {
  const totalPlanned = TYPE_ORDER.reduce((s, t) => s + plannedByType[t], 0)
  const income = summary?.income ?? 0
  const totalSpent = summary
    ? TYPE_ORDER.reduce((s, t) => s + summary.spentByType[t], 0)
    : 0
  // Base da % é a renda do mês; sem entrada registrada não há %
  const hasIncome = income > 0
  const planPct = (value: number) => (hasIncome ? (value / income) * 100 : 0)
  // Plano acima de 100% da renda estica a escala para caber
  const scale = Math.max(100, planPct(totalPlanned))

  return (
    <section
      aria-label="Resumo do plano"
      className="flex flex-col gap-5 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Total planejado
          </span>
          <span className="text-2xl font-bold tracking-tight tabular-nums">
            {formatCurrency(totalPlanned)}
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {isLoading
              ? "Carregando a renda do mês…"
              : hasIncome
                ? `${pct(planPct(totalPlanned))} da renda de ${formatCurrency(income)} · sobra ${formatCurrency(income - totalPlanned)}`
                : "Sem entradas registradas no mês"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 sm:items-end">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Realizado no mês
          </span>
          <span className="text-2xl font-bold tracking-tight tabular-nums">
            {isLoading ? "—" : formatCurrency(totalSpent)}
          </span>
          {totalPlanned > 0 && !isLoading && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {pct((totalSpent / totalPlanned) * 100)} do planejado
            </span>
          )}
        </div>
      </div>

      {isError && (
        <ErrorState
          message="Não foi possível carregar o realizado do mês."
          onRetry={onRetry}
        />
      )}

      {/* Plano (na renda) vs meta 50/30/20 */}
      {hasIncome && (
        <div className="flex flex-col gap-1.5" aria-hidden="true">
          <StackRow label="Plano">
            {TYPE_ORDER.map((type) => (
              <span
                key={type}
                className="h-full"
                style={{
                  width: `${(planPct(plannedByType[type]) / scale) * 100}%`,
                  backgroundColor: BUDGET_TYPE_HEX[type],
                }}
              />
            ))}
          </StackRow>
          <StackRow label="Meta" thin>
            {TYPE_ORDER.map((type) => (
              <span
                key={type}
                className="h-full"
                style={{
                  width: `${(BUDGET_TYPE_TARGET[type] / scale) * 100}%`,
                  backgroundColor: BUDGET_TYPE_HEX[type],
                }}
              />
            ))}
          </StackRow>
          <div className="relative ml-16 h-4 text-[11px] text-muted-foreground tabular-nums">
            {[0, 50, 80, 100].map((tick) => (
              <span
                key={tick}
                className="absolute -translate-x-1/2"
                style={{ left: `${(tick / scale) * 100}%` }}
              >
                {tick}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grupos */}
      <div className="grid border-t sm:grid-cols-3">
        {TYPE_ORDER.map((type) => (
          <GroupStat
            key={type}
            type={type}
            planned={plannedByType[type]}
            share={hasIncome ? planPct(plannedByType[type]) : null}
            spent={summary?.spentByType[type]}
            flow={type === "investment" ? summary?.investmentFlow : undefined}
          />
        ))}
      </div>
    </section>
  )
}

function StackRow({
  label,
  thin,
  children,
}: {
  label: string
  thin?: boolean
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div
        className={cn(
          "flex overflow-hidden rounded bg-muted [&>span+span]:border-l-2 [&>span+span]:border-card",
          thin ? "h-1.5 opacity-60" : "h-3.5"
        )}
      >
        {children}
      </div>
    </div>
  )
}

// Distância da meta: nos gastos, acima é alerta; no investimento, abaixo é
function deltaTone(type: BudgetType, delta: number) {
  const good = type === "investment" ? delta >= -2 : delta <= 2
  if (good) return FINANCE.income
  return Math.abs(delta) > 8 ? FINANCE.expense : PALETTE.amber
}

function GroupStat({
  type,
  planned,
  share,
  spent,
  flow,
}: {
  type: BudgetType
  planned: number
  share: number | null
  spent: number | undefined
  flow?: { invested: number; redeemed: number }
}) {
  const color = BUDGET_TYPE_HEX[type]
  const target = BUDGET_TYPE_TARGET[type]
  const delta = share == null ? null : share - target
  const use = spent != null && planned > 0 ? (spent / planned) * 100 : null

  return (
    <div className="flex flex-col gap-2 border-b py-4 last:border-b-0 sm:border-b-0 sm:border-l sm:px-4 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        {BUDGET_GROUP_LABELS[type]}
      </div>
      <span className="text-xl font-bold tracking-tight tabular-nums">
        {formatCurrency(planned)}
      </span>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {share == null ? "—" : `${pct(share)} da renda`} · meta {target}%
        </span>
        {delta != null && (
          <span
            className="rounded-full px-2 py-px font-semibold whitespace-nowrap tabular-nums"
            style={{
              color: deltaTone(type, delta),
              backgroundColor: tint(deltaTone(type, delta), 14),
            }}
          >
            {delta > 0 ? "+" : delta < 0 ? "−" : ""}
            {Math.abs(delta).toFixed(0)} p.p.
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {type === "investment" ? "Aportado (líquido)" : "Realizado"}
        </span>
        <span className="font-medium text-foreground tabular-nums">
          {spent == null ? "—" : formatCurrency(spent)}
          {use != null && ` · ${pct(use)}`}
        </span>
      </div>
      <UsageBar use={use} color={color} />
      {flow && (flow.invested > 0 || flow.redeemed > 0) && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatCurrency(flow.invested)} aplicado −{" "}
          {formatCurrency(flow.redeemed)} resgatado
        </span>
      )}
    </div>
  )
}

function UsageBar({
  use,
  color,
  className,
}: {
  use: number | null
  color: string
  className?: string
}) {
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
    >
      {use != null && (
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(use, 100))}%`,
            backgroundColor: use > 100 ? FINANCE.expense : color,
          }}
        />
      )}
    </div>
  )
}

// ── Grupo da tabela ───────────────────────────────────────────────────────────
function BudgetGroup({
  type,
  items,
  open,
  onToggle,
  groupPlanned,
  groupSpent,
  spentByBudget,
  rangeMode,
  onEdit,
  onDelete,
}: {
  type: BudgetType
  items: Budget[]
  open: boolean
  onToggle: () => void
  groupPlanned: number
  groupSpent: number | undefined
  spentByBudget: Record<string, number> | undefined
  rangeMode: RangeMode
  onEdit: (budget: Budget) => void
  onDelete: (budget: Budget) => void
}) {
  const color = BUDGET_TYPE_HEX[type]

  return (
    <tbody>
      <tr className="border-b bg-muted/50">
        <td colSpan={2} className="px-2 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronDown
              size={14}
              className={cn(
                "text-muted-foreground transition-transform",
                !open && "-rotate-90"
              )}
            />
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {BUDGET_GROUP_LABELS[type]}
            <span className="font-normal text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "itens"}
            </span>
          </button>
        </td>
        <td className="px-4 text-right font-semibold tabular-nums">
          {formatCurrency(groupPlanned)}
        </td>
        <td className="px-4 text-right font-semibold tabular-nums">
          {groupSpent == null ? "—" : formatCurrency(groupSpent)}
        </td>
        <td colSpan={2} />
      </tr>

      {open &&
        items.map((budget) => {
          const planned = plannedValue(budget, rangeMode)
          const spent = spentByBudget?.[budget.id]
          // Uso contra o teto: numa faixa, o máximo
          const ceiling =
            budget.amountType === "fixed"
              ? planned
              : Number(budget.amountMax ?? 0)
          const use =
            spent != null && ceiling > 0 ? (spent / ceiling) * 100 : null

          return (
            <tr
              key={budget.id}
              className="group border-b transition-colors last:border-b-0 hover:bg-muted/30"
            >
              <td className="py-2 pr-4 pl-11 font-medium">{budget.name}</td>
              <td className="px-4 py-2">
                <span className="rounded-full border px-2 py-px text-xs whitespace-nowrap text-muted-foreground">
                  {budget.amountType === "fixed" ? "Valor exato" : "Faixa"}
                </span>
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {formatBudgetValue(budget)}
              </td>
              <td className="px-4 py-2 text-right">
                {spent == null ? (
                  <span className="text-xs text-muted-foreground">
                    sem vínculo
                  </span>
                ) : (
                  <div className="flex items-center justify-end gap-2">
                    <span className="tabular-nums">
                      {formatCurrency(spent)}
                    </span>
                    <UsageBar
                      use={use}
                      color={color}
                      className="w-16 shrink-0"
                    />
                  </div>
                )}
              </td>
              <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                {groupPlanned > 0 ? pct((planned / groupPlanned) * 100) : "—"}
              </td>
              <td className="px-2 py-1">
                <div className="flex justify-end gap-1 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onEdit(budget)}
                    aria-label={`Editar ${budget.name}`}
                    className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-7"
                  >
                    <Pencil size={15} className="lg:size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(budget)}
                    aria-label={`Excluir ${budget.name}`}
                    className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive lg:size-7"
                  >
                    <Trash2 size={15} className="lg:size-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
    </tbody>
  )
}
