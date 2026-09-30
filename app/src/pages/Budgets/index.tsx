import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ChevronDown, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import {
  useBudgetSummary,
  useBudgets,
  useCategories,
  useDeleteBudget,
} from "@/lib/queries"
import { formatCurrency } from "@/lib/format"
import { FINANCE, PALETTE, tint } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import {
  SPENDING_GROUP_HEX,
  SPENDING_GROUP_LABELS,
  SPENDING_GROUP_ORDER,
  SPENDING_GROUP_TARGET,
  type Budget,
  type BudgetSummary,
  type Category,
  type SpendingGroup,
} from "@/types/finance"

// O orçamento é o plano mensal de uma CATEGORIA. O realizado é o gasto da
// categoria no mês — tudo que a classificação põe nela conta, sem vínculo por
// transação. O grupo 50/30/20 também é da categoria. Ver domain/budget.md.

// Como uma faixa (mín–máx) entra nos totais
type RangeMode = "mid" | "min" | "max"

const RANGE_MODES: { value: RangeMode; label: string }[] = [
  { value: "min", label: "Mínimo" },
  { value: "mid", label: "Médio" },
  { value: "max", label: "Máximo" },
]

// Valor planejado do orçamento; valor exato ignora o modo
function plannedValue(budget: Budget, mode: RangeMode) {
  if (budget.amountType === "exact") return Number(budget.amount ?? 0)
  const min = Number(budget.amountMin ?? 0)
  const max = Number(budget.amountMax ?? 0)
  if (mode === "min") return min
  if (mode === "max") return max
  return (min + max) / 2
}

// Texto do valor: exato ou faixa mín–máx
function formatBudgetValue(budget: Budget) {
  if (budget.amountType === "exact") return formatCurrency(budget.amount ?? 0)
  return `${formatCurrency(budget.amountMin ?? 0)} – ${formatCurrency(budget.amountMax ?? 0)}`
}

function pct(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
}

// Primeiro e último dia do mês, para abrir Transações já filtrada
function monthRange(month: number, year: number) {
  const mm = String(month).padStart(2, "0")
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${new Date(year, month, 0).getDate()}`,
  }
}

/** Linha da tabela: categoria com orçamento, com gasto no mês, ou os dois. */
interface PlanRow {
  category: Category
  budget: Budget | null
  spent: number
  count: number
}

// ── Página ────────────────────────────────────────────────────────────────────
export function Budgets() {
  const { month, year } = usePeriod()
  const [rangeMode, setRangeMode] = useState<RangeMode>("mid")
  const [collapsed, setCollapsed] = useState<Set<SpendingGroup>>(new Set())
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PlanRow | null>(null)
  const [deleting, setDeleting] = useState<PlanRow | null>(null)

  const categories = useCategories()
  const budgets = useBudgets()
  const summary = useBudgetSummary({ month, year })
  const deleteMutation = useDeleteBudget()

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })

  const budgetByCategory = new Map(
    (budgets.data ?? []).map((b) => [b.categoryId, b])
  )
  const spentByCategory = summary.data?.spentByCategory ?? {}

  // Só entra na tabela o que tem plano ou movimento no mês
  const rows: PlanRow[] = (categories.data ?? [])
    .map((category) => ({
      category,
      budget: budgetByCategory.get(category.id) ?? null,
      spent: spentByCategory[category.id]?.total ?? 0,
      count: spentByCategory[category.id]?.count ?? 0,
    }))
    .filter((row) => row.budget || row.count > 0)
    .sort(
      (a, b) =>
        Number(!!b.budget) - Number(!!a.budget) ||
        b.spent - a.spent ||
        a.category.name.localeCompare(b.category.name)
    )

  const plannedByGroup = Object.fromEntries(
    SPENDING_GROUP_ORDER.map((group) => [
      group,
      rows
        .filter((r) => r.category.group === group && r.budget)
        .reduce((sum, r) => sum + plannedValue(r.budget!, rangeMode), 0),
    ])
  ) as Record<SpendingGroup, number>

  const groups = SPENDING_GROUP_ORDER.map((group) => ({
    group,
    rows: rows.filter((r) => r.category.group === group),
  }))
  const hasRange = budgets.data?.some((b) => b.amountType === "range") ?? false
  const withoutBudget = (categories.data ?? []).filter(
    (c) => !budgetByCategory.has(c.id)
  )

  const isLoading = categories.isLoading || budgets.isLoading
  const isError = categories.isError || budgets.isError

  function toggleGroup(group: SpendingGroup) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
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
            {monthLabel} · plano por categoria pela regra 50/30/20
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
          <Button
            onClick={() => setCreating(true)}
            size="sm"
            className="gap-2"
            disabled={withoutBudget.length === 0}
          >
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
          onRetry={() => {
            categories.refetch()
            budgets.refetch()
          }}
        />
      ) : rows.length === 0 && !summary.isLoading ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <PiggyBank size={40} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">
            Nenhum orçamento e nenhum gasto neste mês
          </p>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            Criar primeiro orçamento
          </Button>
        </div>
      ) : (
        <>
          <SummaryCard
            plannedByGroup={plannedByGroup}
            summary={summary.data}
            isLoading={summary.isLoading}
            isError={summary.isError}
            onRetry={() => summary.refetch()}
          />

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Categorias do mês</h2>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                    <th className="px-4 py-2.5 font-semibold">Categoria</th>
                    <th className="px-4 py-2.5 font-semibold">Orçamento</th>
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
                {groups.map(({ group, rows: groupRows }) =>
                  groupRows.length === 0 ? null : (
                    <PlanGroup
                      key={group}
                      group={group}
                      rows={groupRows}
                      open={!collapsed.has(group)}
                      onToggle={() => toggleGroup(group)}
                      groupPlanned={plannedByGroup[group]}
                      groupSpent={summary.data?.spentByGroup[group]}
                      rangeMode={rangeMode}
                      transactionsHref={(categoryId) => {
                        const { from, to } = monthRange(month, year)
                        return `/transactions?categoryId=${categoryId}&from=${from}&to=${to}`
                      }}
                      onEdit={setEditing}
                      onDelete={setDeleting}
                    />
                  )
                )}
              </table>
            </div>
          </section>
        </>
      )}

      {/* Modais */}
      {creating && (
        <BudgetModal
          open
          onClose={() => setCreating(false)}
          title="Novo orçamento"
          choices={withoutBudget}
        />
      )}

      {editing && (
        <BudgetModal
          open
          onClose={() => setEditing(null)}
          title={editing.budget ? "Editar orçamento" : "Definir orçamento"}
          category={editing.category}
          budget={editing.budget}
        />
      )}

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O orçamento de <strong>{deleting?.category.name}</strong> sai do
              plano. A categoria continua no grupo{" "}
              {deleting &&
                SPENDING_GROUP_LABELS[
                  deleting.category.group
                ].toLowerCase()}{" "}
              e as transações não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleting)
                  deleteMutation.mutate(deleting.category.id, {
                    onSuccess: () => setDeleting(null),
                  })
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Resumo: plano vs meta e realizado do mês ──────────────────────────────────
function SummaryCard({
  plannedByGroup,
  summary,
  isLoading,
  isError,
  onRetry,
}: {
  plannedByGroup: Record<SpendingGroup, number>
  summary: BudgetSummary | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}) {
  const totalPlanned = SPENDING_GROUP_ORDER.reduce(
    (s, g) => s + plannedByGroup[g],
    0
  )
  const income = summary?.income ?? 0
  const totalSpent = summary
    ? SPENDING_GROUP_ORDER.reduce((s, g) => s + summary.spentByGroup[g], 0)
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
          {hasIncome && !isLoading && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {pct(planPct(totalSpent))} da renda
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
            {SPENDING_GROUP_ORDER.map((group) => (
              <span
                key={group}
                className="h-full"
                style={{
                  width: `${(planPct(plannedByGroup[group]) / scale) * 100}%`,
                  backgroundColor: SPENDING_GROUP_HEX[group],
                }}
              />
            ))}
          </StackRow>
          <StackRow label="Meta" thin>
            {SPENDING_GROUP_ORDER.map((group) => (
              <span
                key={group}
                className="h-full"
                style={{
                  width: `${(SPENDING_GROUP_TARGET[group] / scale) * 100}%`,
                  backgroundColor: SPENDING_GROUP_HEX[group],
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
        {SPENDING_GROUP_ORDER.map((group) => (
          <GroupStat
            key={group}
            group={group}
            planned={plannedByGroup[group]}
            share={hasIncome ? planPct(plannedByGroup[group]) : null}
            spent={summary?.spentByGroup[group]}
            flow={group === "investment" ? summary?.investmentFlow : undefined}
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
function deltaTone(group: SpendingGroup, delta: number) {
  const good = group === "investment" ? delta >= -2 : delta <= 2
  if (good) return FINANCE.income
  return Math.abs(delta) > 8 ? FINANCE.expense : PALETTE.amber
}

function GroupStat({
  group,
  planned,
  share,
  spent,
  flow,
}: {
  group: SpendingGroup
  planned: number
  share: number | null
  spent: number | undefined
  flow?: { invested: number; redeemed: number }
}) {
  const color = SPENDING_GROUP_HEX[group]
  const target = SPENDING_GROUP_TARGET[group]
  const delta = share == null ? null : share - target
  const use = spent != null && planned > 0 ? (spent / planned) * 100 : null

  return (
    <div className="flex flex-col gap-2 border-b py-4 last:border-b-0 sm:border-b-0 sm:border-l sm:px-4 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        {SPENDING_GROUP_LABELS[group]}
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
              color: deltaTone(group, delta),
              backgroundColor: tint(deltaTone(group, delta), 14),
            }}
          >
            {delta > 0 ? "+" : delta < 0 ? "−" : ""}
            {Math.abs(delta).toFixed(0)} p.p.
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {group === "investment" ? "Aportado (líquido)" : "Realizado"}
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
function PlanGroup({
  group,
  rows,
  open,
  onToggle,
  groupPlanned,
  groupSpent,
  rangeMode,
  transactionsHref,
  onEdit,
  onDelete,
}: {
  group: SpendingGroup
  rows: PlanRow[]
  open: boolean
  onToggle: () => void
  groupPlanned: number
  groupSpent: number | undefined
  rangeMode: RangeMode
  transactionsHref: (categoryId: string) => string
  onEdit: (row: PlanRow) => void
  onDelete: (row: PlanRow) => void
}) {
  const color = SPENDING_GROUP_HEX[group]

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
            {SPENDING_GROUP_LABELS[group]}
            <span className="font-normal text-muted-foreground">
              {rows.length} {rows.length === 1 ? "categoria" : "categorias"}
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
        rows.map((row) => {
          const { category, budget, spent, count } = row
          const planned = budget ? plannedValue(budget, rangeMode) : null
          // Uso contra o teto: numa faixa, o máximo
          const ceiling = budget
            ? budget.amountType === "exact"
              ? Number(budget.amount ?? 0)
              : Number(budget.amountMax ?? 0)
            : 0
          const use = ceiling > 0 ? (spent / ceiling) * 100 : null

          return (
            <tr
              key={category.id}
              className="group border-b transition-colors last:border-b-0 hover:bg-muted/30"
            >
              <td className="py-2 pr-4 pl-11 font-medium">
                <span className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  {category.name}
                </span>
              </td>
              <td className="px-4 py-2">
                {budget ? (
                  <span className="rounded-full border px-2 py-px text-xs whitespace-nowrap text-muted-foreground">
                    {budget.amountType === "exact" ? "Valor exato" : "Faixa"}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    sem orçamento
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {budget ? formatBudgetValue(budget) : "—"}
              </td>
              <td className="px-4 py-2 text-right">
                {count === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    nada no mês
                  </span>
                ) : (
                  <Link
                    to={transactionsHref(category.id)}
                    title={`Ver ${count} ${count === 1 ? "transação" : "transações"}`}
                    className="flex items-center justify-end gap-2 rounded-md hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="tabular-nums">
                      {formatCurrency(spent)}
                    </span>
                    {budget && (
                      <UsageBar
                        use={use}
                        color={color}
                        className="w-16 shrink-0"
                      />
                    )}
                  </Link>
                )}
              </td>
              <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                {planned != null && groupPlanned > 0
                  ? pct((planned / groupPlanned) * 100)
                  : "—"}
              </td>
              <td className="px-2 py-1">
                <div className="flex justify-end gap-1 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    aria-label={`Editar o plano de ${category.name}`}
                    className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-7"
                  >
                    <Pencil size={15} className="lg:size-3.5" />
                  </button>
                  {budget && (
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
                      aria-label={`Remover o orçamento de ${category.name}`}
                      className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive lg:size-7"
                    >
                      <Trash2 size={15} className="lg:size-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )
        })}
    </tbody>
  )
}
