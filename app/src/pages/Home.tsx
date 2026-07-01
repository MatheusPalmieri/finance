import { useState } from "react"
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Repeat,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { Link } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { ChartCard, ChartTooltip, StatCard } from "@/components/charts"
import { useDashboardSummary } from "@/lib/queries"
import { formatCurrency, formatCurrencyCompact, formatDate, formatMonthLabel } from "@/lib/format"
import { FINANCE, tint } from "@/lib/tokens"
import { MONTHS, type NamedAmount, type Transaction } from "@/types/finance"

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

function pct(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0
}

export function Home() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  const { data, isLoading, isError, refetch } = useDashboardSummary({ month, year })

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  const total = Number(data?.totalExpenses ?? 0)
  const essential = Number(data?.essentialExpenses ?? 0)
  const nonEssential = Number(data?.nonEssentialExpenses ?? 0)
  const fixed = Number(data?.fixedExpenses ?? 0)
  const variable = Number(data?.variableExpenses ?? 0)

  return (
    <div className="flex flex-col gap-8">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting()} 👋</h1>
          <p className="text-sm text-muted-foreground">Resumo das suas despesas</p>
        </div>

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
            {MONTHS[month - 1]} {year}
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
      </div>

      {isError ? (
        <ErrorState
          message="Não foi possível carregar o resumo do mês."
          onRetry={() => refetch()}
        />
      ) : (
      <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Despesas do mês"
              value={formatCurrencyCompact(total)}
              hint={`${data?.transactionCount ?? 0} lançamentos`}
              icon={Receipt}
              accent={FINANCE.expense}
              delay={0}
            />
            <StatCard
              label="Essenciais"
              value={formatCurrencyCompact(essential)}
              hint={`${pct(essential, total).toFixed(0)}% do total`}
              icon={ShieldCheck}
              accent={FINANCE.essential}
              delay={60}
            />
            <StatCard
              label="Não essenciais"
              value={formatCurrencyCompact(nonEssential)}
              hint={`${pct(nonEssential, total).toFixed(0)}% do total`}
              icon={Sparkles}
              accent={FINANCE.nonEssential}
              delay={120}
            />
            <StatCard
              label="Gastos fixos"
              value={formatCurrencyCompact(fixed)}
              hint={`${pct(fixed, total).toFixed(0)}% do total`}
              icon={Repeat}
              accent={FINANCE.fixed}
              delay={180}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Tendência mensal */}
        <ChartCard
          title="Tendência de despesas"
          subtitle="Últimos 6 meses"
          className="lg:col-span-3"
          delay={220}
        >
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : !data?.monthlyTrend.length ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.monthlyTrend}>
                <defs>
                  <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={FINANCE.expense} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={FINANCE.expense} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonthLabel}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatCurrencyCompact}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip content={<ChartTooltip label="" format={(v) => formatCurrency(v)} />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Despesas"
                  stroke={FINANCE.expense}
                  strokeWidth={2}
                  fill="url(#gradExpenses)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Por categoria */}
        <ChartCard title="Por categoria" subtitle="Distribuição do mês" className="lg:col-span-2" delay={260}>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : !data?.expensesByCategory.length ? (
            <EmptyChart />
          ) : (
            <ExpensesPie data={data.expensesByCategory} />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Composição: essencial vs não / fixo vs variável */}
        <ChartCard title="Composição" subtitle="Como o mês se divide" className="lg:col-span-2" delay={300}>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : total === 0 ? (
            <EmptyChart />
          ) : (
            <div className="flex flex-col gap-4">
              <SplitBar
                label="Essencial vs não essencial"
                left={{ label: "Essencial", value: essential, color: FINANCE.essential }}
                right={{ label: "Não essencial", value: nonEssential, color: FINANCE.nonEssential }}
              />
              <SplitBar
                label="Fixo vs variável"
                left={{ label: "Fixo", value: fixed, color: FINANCE.fixed }}
                right={{ label: "Variável", value: variable, color: FINANCE.variable }}
              />
            </div>
          )}
        </ChartCard>

        {/* Por forma de pagamento */}
        <ChartCard title="Por forma de pagamento" subtitle="Onde o dinheiro saiu" className="lg:col-span-3" delay={340}>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !data?.expensesByPaymentMethod.length ? (
            <EmptyChart />
          ) : (
            <RankedBars items={data.expensesByPaymentMethod} total={total} />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Por conta */}
        <ChartCard title="Por conta" subtitle="De onde saiu" className="lg:col-span-2" delay={380}>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !data?.expensesByAccount.length ? (
            <EmptyChart />
          ) : (
            <RankedBars items={data.expensesByAccount} total={total} />
          )}
        </ChartCard>

        {/* Recentes */}
        <ChartCard
          title="Recentes"
          subtitle="Últimas transações"
          className="lg:col-span-3"
          delay={420}
          action={
            <Link
              to="/transactions"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Ver todas
              <ArrowUpRight size={13} />
            </Link>
          }
        >
          <div className="-mx-1 flex flex-col">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-1 py-2.5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-lg" />
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))
            ) : !data?.recentTransactions.length ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma transação ainda</p>
            ) : (
              data.recentTransactions.map((tx) => <RecentTransactionRow key={tx.id} tx={tx} />)
            )}
          </div>
        </ChartCard>
      </div>
      </>
      )}
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function EmptyChart() {
  return (
    <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
      Sem dados para exibir
    </div>
  )
}

function ExpensesPie({ data }: { data: { categoryId: string; categoryName: string; color: string; amount: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="amount" nameKey="categoryName" strokeWidth={0}>
            {data.map((entry) => (
              <Cell key={entry.categoryId} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip format={(v) => formatCurrency(v)} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5">
        {data.slice(0, 4).map((item) => (
          <div key={item.categoryId} className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate text-xs text-muted-foreground">{item.categoryName}</span>
            </div>
            <span className="text-xs font-medium tabular-nums">{formatCurrencyCompact(item.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Barra dividida em duas porções (ex: essencial vs não essencial)
function SplitBar({
  label,
  left,
  right,
}: {
  label: string
  left: { label: string; value: number; color: string }
  right: { label: string; value: number; color: string }
}) {
  const sum = left.value + right.value
  const leftPct = sum > 0 ? (left.value / sum) * 100 : 50

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        <div style={{ width: `${leftPct}%`, backgroundColor: left.color }} />
        <div style={{ width: `${100 - leftPct}%`, backgroundColor: right.color }} />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: left.color }} />
          <span className="text-muted-foreground">{left.label}</span>
          <span className="font-medium tabular-nums">{formatCurrencyCompact(left.value)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-medium tabular-nums">{formatCurrencyCompact(right.value)}</span>
          <span className="text-muted-foreground">{right.label}</span>
          <span className="size-2 rounded-full" style={{ backgroundColor: right.color }} />
        </span>
      </div>
    </div>
  )
}

// Lista de barras horizontais proporcionais (ex: por forma de pagamento)
function RankedBars({ items, total }: { items: NamedAmount[]; total: number }) {
  return (
    <div className="flex flex-col gap-3">
      {items.slice(0, 6).map((item) => {
        const value = Number(item.amount)
        const width = total > 0 ? (value / total) * 100 : 0
        return (
          <div key={item.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">{item.name}</span>
              </span>
              <span className="font-medium tabular-nums">{formatCurrencyCompact(value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${width}%`, backgroundColor: item.color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RecentTransactionRow({ tx }: { tx: Transaction }) {
  const amount = Number(tx.amount)
  const isIncome = amount < 0
  const color = isIncome ? FINANCE.income : (tx.category?.color ?? FINANCE.neutral)

  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-muted/40">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: tint(color) }}>
        {isIncome ? <ArrowUpRight size={14} style={{ color }} /> : <ArrowDownRight size={14} style={{ color }} />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tx.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {tx.category?.name ?? "Sem categoria"} · {formatDate(tx.date)}
        </p>
      </div>

      <span
        className={
          isIncome
            ? "shrink-0 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
            : "shrink-0 text-sm font-semibold tabular-nums"
        }
      >
        {isIncome ? "+" : "−"}{formatCurrency(Math.abs(amount))}
      </span>
    </div>
  )
}
