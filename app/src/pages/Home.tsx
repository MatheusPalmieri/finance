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
  FileText,
  Receipt,
  Repeat,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  Wallet,
} from "lucide-react"
import { Link } from "react-router-dom"
import { usePeriod } from "@/components/period-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SnapshotStatus } from "@/components/open-finance/SnapshotStatus"
import { ChartCard, ChartTooltip, StatCard } from "@/components/charts"
import {
  useCashflow,
  useCurrentReport,
  useDashboardSummary,
  useBalances,
  useInvestments,
} from "@/lib/queries"
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatMonthLabel,
} from "@/lib/format"
import { FINANCE, tint } from "@/lib/tokens"
import {
  INSIGHT_SEVERITY_HEX,
  MONTHS,
  type NamedAmount,
  type Transaction,
} from "@/types/finance"

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
  // Mês vem do filtro global (sidebar)
  const { month, year } = usePeriod()

  const { data, isLoading, isError, refetch } = useDashboardSummary({
    month,
    year,
  })

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
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Resumo das suas despesas
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BalanceCard />
        <ForecastCard />
        <CheckupCard />
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
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))
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
                      <linearGradient
                        id="gradExpenses"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={FINANCE.expense}
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="95%"
                          stopColor={FINANCE.expense}
                          stopOpacity={0}
                        />
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
                    <Tooltip
                      content={
                        <ChartTooltip
                          label=""
                          format={(v) => formatCurrency(v)}
                        />
                      }
                    />
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
            <ChartCard
              title="Por categoria"
              subtitle="Distribuição do mês"
              className="lg:col-span-2"
              delay={260}
            >
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
            <ChartCard
              title="Composição"
              subtitle="Como o mês se divide"
              className="lg:col-span-2"
              delay={300}
            >
              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : total === 0 ? (
                <EmptyChart />
              ) : (
                <div className="flex flex-col gap-4">
                  <SplitBar
                    label="Essencial vs não essencial"
                    left={{
                      label: "Essencial",
                      value: essential,
                      color: FINANCE.essential,
                    }}
                    right={{
                      label: "Não essencial",
                      value: nonEssential,
                      color: FINANCE.nonEssential,
                    }}
                  />
                  <SplitBar
                    label="Fixo vs variável"
                    left={{ label: "Fixo", value: fixed, color: FINANCE.fixed }}
                    right={{
                      label: "Variável",
                      value: variable,
                      color: FINANCE.variable,
                    }}
                  />
                </div>
              )}
            </ChartCard>

            {/* Por forma de pagamento */}
            <ChartCard
              title="Por forma de pagamento"
              subtitle="Onde o dinheiro saiu"
              className="lg:col-span-3"
              delay={340}
            >
              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !data?.expensesByPaymentMethod.length ? (
                <EmptyChart />
              ) : (
                <RankedBars
                  items={data.expensesByPaymentMethod}
                  total={total}
                />
              )}
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Por conta */}
            <ChartCard
              title="Por conta"
              subtitle="De onde saiu"
              className="lg:col-span-2"
              delay={380}
            >
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
                    <div
                      key={i}
                      className="flex items-center justify-between px-1 py-2.5"
                    >
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
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nenhuma transação ainda
                  </p>
                ) : (
                  data.recentTransactions.map((tx) => (
                    <RecentTransactionRow key={tx.id} tx={tx} />
                  ))
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

function ExpensesPie({
  data,
}: {
  data: {
    categoryId: string
    categoryName: string
    color: string
    amount: string
  }[]
}) {
  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={65}
            dataKey="amount"
            nameKey="categoryName"
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.categoryId} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={<ChartTooltip format={(v) => formatCurrency(v)} />}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5">
        {data.slice(0, 4).map((item) => (
          <div
            key={item.categoryId}
            className="flex items-center justify-between gap-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-xs text-muted-foreground">
                {item.categoryName}
              </span>
            </div>
            <span className="text-xs font-medium tabular-nums">
              {formatCurrencyCompact(item.amount)}
            </span>
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
        <div
          style={{ width: `${100 - leftPct}%`, backgroundColor: right.color }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: left.color }}
          />
          <span className="text-muted-foreground">{left.label}</span>
          <span className="font-medium tabular-nums">
            {formatCurrencyCompact(left.value)}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-medium tabular-nums">
            {formatCurrencyCompact(right.value)}
          </span>
          <span className="text-muted-foreground">{right.label}</span>
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: right.color }}
          />
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
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-muted-foreground">{item.name}</span>
              </span>
              <span className="font-medium tabular-nums">
                {formatCurrencyCompact(value)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${width}%`, backgroundColor: item.color }}
              />
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
  const color = isIncome
    ? FINANCE.income
    : (tx.category?.color ?? FINANCE.neutral)

  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-muted/40">
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

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tx.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {tx.category?.name ?? "Sem categoria"} · {formatDate(tx.date)}
        </p>
      </div>

      <span
        className={
          isIncome
            ? "shrink-0 text-sm font-semibold text-emerald-600 tabular-nums dark:text-emerald-400"
            : "shrink-0 text-sm font-semibold tabular-nums"
        }
      >
        {isIncome ? "+" : "−"}
        {formatCurrency(Math.abs(amount))}
      </span>
    </div>
  )
}

// ── Card do check-up mensal ──────────────────────────────────────────────────
// Só aparece quando existe (ou dá para gerar) o relatório do mês anterior.
// Os números vêm das métricas persistidas — nunca do texto da IA.
function CheckupCard() {
  const { data: report, isLoading, isError } = useCurrentReport()

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />
  if (isError || !report) return null

  const { metrics, insights } = report
  const net = metrics.totals.netResult.current
  const positive = net >= 0
  const hasMovement =
    metrics.totals.transactionCount.current > 0 ||
    metrics.totals.totalIncome.current > 0
  if (!hasMovement) return null

  const top = insights.slice(0, 2)

  return (
    <Link
      to="/reports"
      className="flex flex-col gap-3 rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <FileText size={15} className="text-muted-foreground" />
          Check-up de {MONTHS[metrics.period.month - 1]}
        </span>
        <span className="text-xs text-muted-foreground">Ver relatório →</span>
      </div>

      <p className="text-lg font-semibold tracking-tight">
        Fechou com{" "}
        <span
          className="tabular-nums"
          style={{ color: positive ? FINANCE.income : FINANCE.expense }}
        >
          {formatCurrency(Math.abs(net))}
        </span>{" "}
        {positive ? "positivos" : "negativos"}
      </p>

      {top.length > 0 && (
        <ul className="flex flex-col gap-1">
          {top.map((insight, i) => (
            <li
              key={`${insight.kind}-${i}`}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: INSIGHT_SEVERITY_HEX[insight.severity],
                }}
              />
              <span className="truncate">{insight.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  )
}

// ── Card da projeção do mês ──────────────────────────────────────────────────
// Saldo previsto para o fim do mês corrente (p50) e a chance de fechar positivo.
// Os números vêm do motor determinístico, nunca de IA.
function ForecastCard() {
  const { data, isLoading, isError } = useCashflow({ horizonMonths: 1 })

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />
  if (isError || !data?.months.length) return null

  const current = data.months[0]
  const positive = current.balance.p50 >= 0
  const chance = Math.round((1 - current.probNegative) * 100)
  const color = positive ? FINANCE.income : FINANCE.expense

  return (
    <Link
      to="/forecast"
      className="flex flex-col gap-2 rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp size={15} className="text-muted-foreground" />
          Projeção de {MONTHS[current.month - 1].toLowerCase()}
        </span>
        <span className="text-xs text-muted-foreground">Ver projeção →</span>
      </div>

      <p className="text-lg font-semibold tracking-tight">
        Deve fechar o mês com{" "}
        <span className="tabular-nums" style={{ color }}>
          {formatCurrency(current.balance.p50)}
        </span>
      </p>

      <p className="text-xs text-muted-foreground">
        {chance}% de chance de fechar no positivo · faixa provável entre{" "}
        <span className="tabular-nums">
          {formatCurrency(current.balance.p25)}
        </span>{" "}
        e{" "}
        <span className="tabular-nums">
          {formatCurrency(current.balance.p75)}
        </span>
      </p>
    </Link>
  )
}

// ── Card de patrimônio ───────────────────────────────────────────────────────
// Conta + investimentos − fatura em aberto, do retrato do Open Finance salvo no
// banco. Sem retrato e sem Open Finance configurado, o card não aparece.
function BalanceCard() {
  const { data: balances, isLoading } = useBalances()
  const { data: investments } = useInvestments()

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />
  if (
    !balances ||
    (!balances.available && balances.error === "Open Finance não configurado")
  )
    return null

  const invested = investments?.available ? investments.total : 0
  const total = balances.cash + invested - balances.cardDebt
  const card = balances.accounts.find((a) => a.type === "CREDIT")

  return (
    <Link
      to="/open-finance"
      className="flex flex-col gap-2 rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Wallet size={15} className="text-muted-foreground" />
          Patrimônio agora
        </span>
        <SnapshotStatus meta={balances} />
      </div>

      {balances.available ? (
        <>
          <p className="text-lg font-semibold tracking-tight tabular-nums">
            {formatCurrency(total)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Conta {formatCurrency(balances.cash)}
            {investments?.available &&
              ` · Investido ${formatCurrencyCompact(invested)}`}
            {card && ` · Fatura −${formatCurrencyCompact(card.balance)}`}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Não foi possível consultar o banco agora
        </p>
      )}
    </Link>
  )
}
