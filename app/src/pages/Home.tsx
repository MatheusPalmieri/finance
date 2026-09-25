import { useState } from "react"
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowDownRight, ArrowUpRight, Pencil } from "lucide-react"
import { Link } from "react-router-dom"
import { usePeriod } from "@/components/period-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SnapshotStatus } from "@/components/open-finance/SnapshotStatus"
import { AccountModal } from "@/components/accounts/AccountModal"
import { ChartCard, ChartTooltip } from "@/components/charts"
import {
  useAccounts,
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
import { FINANCE, PALETTE, tint } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import {
  INSIGHT_SEVERITY_HEX,
  MONTHS,
  type Account,
  type AccountBalance,
  type BalancesSnapshot,
  type DashboardSummary,
  type InsightSeverity,
  type Transaction,
} from "@/types/finance"

const SEVERITY_LABELS: Record<InsightSeverity, string> = {
  critical: "Crítico",
  warn: "Atenção",
  info: "Info",
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

// Rótulo pequeno em caixa alta, padrão dos blocos da Home
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  )
}

export function Home() {
  // Mês vem do filtro global (sidebar)
  const { month, year } = usePeriod()

  const { data, isLoading, isError, refetch } = useDashboardSummary({
    month,
    year,
  })
  const { data: balances } = useBalances()
  const { data: accounts } = useAccounts()

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho: o selo de sincronização vive só aqui */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Resumo das suas despesas
          </p>
        </div>
        {balances && (
          <SnapshotStatus
            meta={balances}
            className="rounded-full border bg-card px-2.5 py-1"
          />
        )}
      </div>

      {/* 1. Posição agora */}
      <PositionStrip accounts={accounts ?? []} />

      {isError ? (
        <ErrorState
          message="Não foi possível carregar o resumo do mês."
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {/* 2. Gastos do mês */}
          <SpendCard data={data} isLoading={isLoading} month={month} />

          {/* 3. Para onde foi */}
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <ChartCard
              title="Gasto por mês"
              subtitle="Últimos 6 meses"
              delay={220}
            >
              {isLoading ? (
                <Skeleton className="h-52 w-full" />
              ) : !data?.monthlyTrend.length ? (
                <EmptyChart />
              ) : (
                <TrendChart
                  trend={data.monthlyTrend}
                  partial={data.pace.partial}
                />
              )}
            </ChartCard>

            <ChartCard
              title="Por categoria"
              subtitle="Distribuição do mês"
              delay={260}
            >
              {isLoading ? (
                <Skeleton className="h-52 w-full" />
              ) : !data?.expensesByCategory.length ? (
                <EmptyChart />
              ) : (
                <CategoryBars
                  items={data.expensesByCategory}
                  total={Number(data.totalExpenses)}
                />
              )}
            </ChartCard>
          </div>

          {/* 4. O que vem + recentes. Os cards da esquerda esticam para
              acompanhar a altura de Recentes */}
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <div className="flex flex-col gap-4">
              <ForecastCard />
              <CheckupCard />
            </div>

            <ChartCard
              title="Recentes"
              subtitle="Últimas transações"
              delay={300}
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
                    <RecentTransactionRow
                      key={tx.id}
                      tx={tx}
                      showAccount={(accounts?.length ?? 0) > 1}
                    />
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

// ── Posição agora ─────────────────────────────────────────────────────────────
// Conta, fatura aberta e investido numa faixa só, do retrato do Open Finance
// salvo no banco. Cada banco é uma linha dentro da coluna. Sem retrato e sem
// Open Finance configurado, a faixa não aparece.
function PositionStrip({ accounts }: { accounts: Account[] }) {
  const { data: balances, isLoading } = useBalances()
  const { data: investments } = useInvestments()
  const [editing, setEditing] = useState<Account | null>(null)

  if (isLoading) return <Skeleton className="h-52 rounded-xl" />
  if (
    !balances ||
    (!balances.available && balances.error === "Open Finance não configurado")
  )
    return null

  if (!balances.available) {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        Não foi possível consultar o banco agora
      </div>
    )
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const banks = balances.accounts.filter((a) => a.type === "BANK")
  const cards = balances.accounts.filter((a) => a.type === "CREDIT")

  const bill = cards.reduce((sum, c) => sum + (c.monthBill ?? 0), 0)
  const limit = cards.reduce((sum, c) => sum + (c.creditLimit ?? 0), 0)
  const invested = investments?.available ? investments.total : 0
  const netWorth = balances.cash + invested - balances.cardDebt

  return (
    <div className="animate-in overflow-hidden rounded-xl border bg-card duration-500 fade-in slide-in-from-bottom-2">
      <div className="grid md:grid-cols-3 md:divide-x">
        {/* Saldo em conta */}
        <section className="flex flex-col gap-2.5 p-5">
          <Eyebrow>Saldo em conta</Eyebrow>
          <p
            className={cn(
              "text-3xl font-semibold tabular-nums",
              balances.cash < 0 && "text-destructive"
            )}
          >
            {formatCurrency(balances.cash)}
          </p>
          <div className="flex flex-col gap-1.5">
            {banks.map((b) => (
              <BankRow
                key={b.accountId}
                balance={b}
                value={b.balance}
                account={accountById.get(b.accountId)}
                onEdit={setEditing}
              />
            ))}
          </div>
        </section>

        {/* Fatura aberta: saída, sempre em vermelho */}
        <section className="flex flex-col gap-2.5 border-t p-5 md:border-t-0">
          <Eyebrow>Fatura aberta</Eyebrow>
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum cartão vinculado
            </p>
          ) : (
            <>
              <p className="text-3xl font-semibold text-destructive tabular-nums">
                {formatCurrency(bill)}
              </p>
              <div className="flex flex-col gap-1.5">
                {cards.map((c) => (
                  <BankRow
                    key={c.accountId}
                    balance={c}
                    value={c.monthBill ?? 0}
                    account={accountById.get(c.accountId)}
                    onEdit={setEditing}
                    suffix={
                      c.dueDate &&
                      c.dueDate >= new Date().toISOString().slice(0, 10)
                        ? ` · vence ${formatDate(c.dueDate).slice(0, 5)}`
                        : ""
                    }
                  />
                ))}
              </div>
              {limit > 0 && <LimitMeter cards={cards} limit={limit} />}
            </>
          )}
        </section>

        {/* Investido */}
        <section className="flex flex-col gap-2.5 border-t p-5 md:border-t-0">
          <Eyebrow>Investido</Eyebrow>
          {investments?.available ? (
            <>
              <p className="text-3xl font-semibold tabular-nums">
                {formatCurrency(investments.total)}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatCurrencyCompact(investments.liquid)} com liquidez diária
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Indisponível</p>
          )}
          <Link
            to="/investments"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Ver investimentos →
          </Link>
        </section>
      </div>

      {/* Patrimônio: número derivado, vira rodapé com a fórmula escrita */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t px-5 py-3 text-sm">
        <span className="text-muted-foreground">
          Patrimônio líquido{" "}
          <b className="font-semibold text-foreground tabular-nums">
            {formatCurrency(netWorth)}
          </b>
        </span>
        <span className="text-xs text-muted-foreground">
          conta + investido − dívida total dos cartões (com parcelas futuras)
        </span>
      </div>

      {editing && (
        <AccountModal
          open={!!editing}
          onClose={() => setEditing(null)}
          account={editing}
        />
      )}
    </div>
  )
}

// Linha de um banco/cartão com a cor da conta; o lápis edita a aparência
function BankRow({
  balance,
  value,
  account,
  onEdit,
  suffix = "",
}: {
  balance: AccountBalance
  value: number
  account?: Account
  onEdit: (account: Account) => void
  suffix?: string
}) {
  return (
    <div className="group flex items-center justify-between gap-2 text-sm">
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: account?.color ?? FINANCE.neutral }}
        />
        <span className="truncate">
          {account?.name ?? balance.accountName}
          {suffix}
        </span>
        {account && (
          <button
            type="button"
            onClick={() => onEdit(account)}
            aria-label={`Editar aparência de ${account.name}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
          >
            <Pencil size={12} />
          </button>
        )}
      </span>
      <span className="shrink-0 tabular-nums">{formatCurrency(value)}</span>
    </div>
  )
}

// Quanto do limite dos cartões está usado (dívida total), uma faixa por cartão
function LimitMeter({
  cards,
  limit,
}: {
  cards: BalancesSnapshot["accounts"]
  limit: number
}) {
  const debt = cards.reduce((sum, c) => sum + c.balance, 0)
  return (
    <>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted">
        {cards.map((c) => (
          <div
            key={c.accountId}
            className="h-full rounded-full"
            style={{
              width: `${(c.balance / limit) * 100}%`,
              backgroundColor: PALETTE.red,
            }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {formatCurrencyCompact(debt)} usados de {formatCurrencyCompact(limit)}{" "}
        de limite
      </p>
    </>
  )
}

// ── Gastos do mês ─────────────────────────────────────────────────────────────
// Total, compras no cartão, essencial e recorrentes, com o ritmo contra o mês
// anterior no mesmo dia e a composição numa barra só.
function SpendCard({
  data,
  isLoading,
  month,
}: {
  data?: DashboardSummary
  isLoading: boolean
  month: number
}) {
  if (isLoading || !data) return <Skeleton className="h-56 rounded-xl" />

  const total = Number(data.totalExpenses)
  const essential = Number(data.essentialExpenses)
  const nonEssential = Number(data.nonEssentialExpenses)
  const unclassified = Number(data.unclassifiedExpenses)
  const fixed = Number(data.fixedExpenses)

  const byMethod = (id: string) =>
    Number(data.expensesByPaymentMethod.find((m) => m.id === id)?.amount ?? 0)
  const card = byMethod("credit_card")
  const pix = byMethod("pix")
  const boleto = byMethod("boleto")

  const previous = Number(data.pace.previousTotal)
  const paceValue =
    previous > 0 ? Math.round(((total - previous) / previous) * 100) : null
  const prevMonthLabel = MONTHS[(month + 10) % 12].slice(0, 3).toLowerCase()

  const parts = [
    { label: "Essencial", value: essential, color: FINANCE.essential },
    {
      label: "Não essencial",
      value: nonEssential,
      color: FINANCE.nonEssential,
    },
    {
      label: "Sem classificação",
      value: unclassified,
      color: FINANCE.neutral,
      hatch: true,
    },
  ].filter((p) => p.value > 0)

  return (
    <div className="animate-in rounded-xl border bg-card p-5 duration-500 fade-in slide-in-from-bottom-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Gastos de {MONTHS[month - 1].toLowerCase()}
        </h2>
        <Link
          to="/transactions"
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver transações →
        </Link>
      </div>

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Sem despesas neste mês
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-y-4 lg:grid-cols-4 lg:divide-x">
            <Kpi
              label="Total gasto"
              value={formatCurrency(total)}
              hint={
                <>
                  {paceValue !== null && (
                    <span
                      className="mr-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                      style={{
                        color: paceValue > 0 ? FINANCE.expense : FINANCE.income,
                        backgroundColor: tint(
                          paceValue > 0 ? FINANCE.expense : FINANCE.income
                        ),
                      }}
                    >
                      {paceValue > 0 ? "▲" : "▼"} {Math.abs(paceValue)}%
                    </span>
                  )}
                  {paceValue !== null &&
                    (data.pace.partial
                      ? `vs ${prevMonthLabel} no dia ${data.pace.cutoffDay} · `
                      : `vs ${prevMonthLabel} · `)}
                  {data.transactionCount} lançamentos
                </>
              }
            />
            <Kpi
              label="Compras no cartão"
              value={formatCurrency(card)}
              hint={[
                `${pct(card, total)}%`,
                pix > 0 && `Pix ${formatCurrencyCompact(pix)}`,
                boleto > 0 && `boleto ${formatCurrencyCompact(boleto)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <Kpi
              label="Essencial"
              dot={FINANCE.essential}
              value={formatCurrency(essential)}
              hint={`${pct(essential, total)}% do total`}
            />
            <Kpi
              label="Recorrentes"
              value={formatCurrency(fixed)}
              hint={`${pct(fixed, total)}% do total`}
            />
          </div>

          {/* Composição */}
          <div className="mt-5 flex flex-col gap-2.5">
            <div
              className="flex h-3.5 gap-0.5"
              role="img"
              aria-label="Composição dos gastos"
            >
              {parts.map((p) => (
                <div
                  key={p.label}
                  className="h-full min-w-1 rounded"
                  title={`${p.label}: ${formatCurrency(p.value)} · ${pct(p.value, total)}%`}
                  style={{
                    width: `${(p.value / total) * 100}%`,
                    backgroundColor: p.color,
                    backgroundImage: p.hatch
                      ? "repeating-linear-gradient(135deg, transparent 0 4px, rgb(255 255 255 / 0.28) 4px 5px)"
                      : undefined,
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
              {parts.map((p) => (
                <span key={p.label} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.label}{" "}
                  <b className="font-semibold text-foreground tabular-nums">
                    {formatCurrencyCompact(p.value)}
                  </b>{" "}
                  {pct(p.value, total)}%
                </span>
              ))}
              {data.unclassifiedCount > 0 && (
                <Link
                  to="/transactions"
                  className="ml-auto font-semibold text-primary"
                >
                  Classificar {data.unclassifiedCount} →
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  dot,
}: {
  label: string
  value: string
  hint: React.ReactNode
  dot?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 lg:px-5 lg:first:pl-0">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {dot && (
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: dot }}
          />
        )}
        {label}
      </span>
      <span className="truncate text-2xl font-semibold tabular-nums">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
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

// Meses são valores discretos: barras. A linha tracejada é a média dos meses
// fechados e o mês em curso, quando parcial, sai mais forte e marcado
function TrendChart({
  trend,
  partial,
}: {
  trend: DashboardSummary["monthlyTrend"]
  partial: boolean
}) {
  const closed = partial ? trend.slice(0, -1) : trend
  const average = closed.length
    ? closed.reduce((sum, m) => sum + m.total, 0) / closed.length
    : null
  const last = trend.length - 1

  return (
    <>
      {average !== null && (
        <p className="-mt-2 mb-2 text-right text-xs text-muted-foreground">
          média{" "}
          <span className="tabular-nums">{formatCurrencyCompact(average)}</span>
        </p>
      )}
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={trend}>
          <XAxis
            dataKey="month"
            tickFormatter={(ym: string, i: number) =>
              `${formatMonthLabel(ym).split(" ")[0]}${partial && i === last ? " (parcial)" : ""}`
            }
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatCurrencyCompact}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip
            cursor={{ fill: "transparent" }}
            content={
              <ChartTooltip label="" format={(v) => formatCurrency(v)} />
            }
          />
          {average !== null && (
            <ReferenceLine
              y={average}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeDasharray="4 4"
            />
          )}
          <Bar
            dataKey="total"
            name="Despesas"
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
          >
            {trend.map((m, i) => (
              <Cell
                key={m.month}
                fill={FINANCE.expense}
                fillOpacity={i === last ? 1 : 0.5}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  )
}

// Barras ordenadas: as cinco maiores categorias + "Outras". A soma sempre
// fecha com o total do mês
function CategoryBars({
  items,
  total,
}: {
  items: DashboardSummary["expensesByCategory"]
  total: number
}) {
  const top = items.slice(0, 5).map((c) => ({
    id: c.categoryId ?? c.categoryName,
    name: c.categoryName,
    color: c.color,
    value: Number(c.amount),
  }))
  const rest = items.slice(5)
  const rows = rest.length
    ? [
        ...top,
        {
          id: "others",
          name: `Outras (${rest.length})`,
          color: FINANCE.neutral,
          value: rest.reduce((sum, c) => sum + Number(c.amount), 0),
        },
      ]
    : top
  const max = Math.max(...rows.map((r) => r.value))

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: r.color }}
              />
              <span className="truncate">{r.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatCurrency(r.value)}
              <small className="ml-1.5 text-xs text-muted-foreground">
                {pct(r.value, total)}%
              </small>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${max > 0 ? (r.value / max) * 100 : 0}%`,
                backgroundColor: r.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function RecentTransactionRow({
  tx,
  showAccount,
}: {
  tx: Transaction
  showAccount: boolean
}) {
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
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className="truncate">
            {tx.category?.name ?? "Sem categoria"} · {formatDate(tx.date)}
          </span>
          {showAccount && tx.account && (
            <span className="flex shrink-0 items-center gap-1">
              ·
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: tx.account.color }}
              />
              {tx.account.name}
            </span>
          )}
        </p>
      </div>

      <span
        className={
          isIncome
            ? "shrink-0 text-sm font-semibold text-emerald-600 tabular-nums dark:text-emerald-400"
            : "shrink-0 text-sm font-semibold text-red-600 tabular-nums dark:text-red-400"
        }
      >
        {isIncome && "+"}
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

  if (isLoading) return <Skeleton className="flex-1 rounded-xl" />
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
      className="flex flex-1 flex-col justify-center gap-2.5 rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
    >
      <Eyebrow>Check-up de {MONTHS[metrics.period.month - 1]}</Eyebrow>

      <p className="text-base font-medium tracking-tight text-balance">
        {positive ? "Você recebeu " : "Você gastou "}
        <span
          className="font-semibold tabular-nums"
          style={{ color: positive ? FINANCE.income : FINANCE.expense }}
        >
          {formatCurrency(Math.abs(net))}
        </span>{" "}
        {positive ? "a mais do que gastou" : "a mais do que recebeu"}
      </p>

      {top.length > 0 && (
        <ul className="flex flex-col gap-1">
          {top.map((insight, i) => (
            <li
              key={`${insight.kind}-${i}`}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                className="shrink-0 rounded px-1.5 py-px text-[10px] font-bold tracking-wide uppercase"
                style={{
                  color: INSIGHT_SEVERITY_HEX[insight.severity],
                  backgroundColor: tint(INSIGHT_SEVERITY_HEX[insight.severity]),
                }}
              >
                {SEVERITY_LABELS[insight.severity]}
              </span>
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

  if (isLoading) return <Skeleton className="flex-1 rounded-xl" />
  if (isError || !data?.months.length) return null

  const current = data.months[0]
  const positive = current.balance.p50 >= 0
  const chance = Math.round((1 - current.probNegative) * 100)
  const color = positive ? FINANCE.income : FINANCE.expense

  return (
    <Link
      to="/forecast"
      className="flex flex-1 flex-col justify-center gap-2.5 rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
    >
      <Eyebrow>
        Projeção · fim de {MONTHS[current.month - 1].toLowerCase()}
      </Eyebrow>

      <p className="text-base font-medium tracking-tight text-balance">
        A conta deve fechar o mês com{" "}
        <span className="font-semibold tabular-nums" style={{ color }}>
          {formatCurrency(current.balance.p50)}
        </span>
      </p>

      <p className="text-xs text-muted-foreground">
        faixa provável{" "}
        <span className="tabular-nums">
          {formatCurrencyCompact(current.balance.p25)}
        </span>{" "}
        a{" "}
        <span className="tabular-nums">
          {formatCurrencyCompact(current.balance.p75)}
        </span>{" "}
        · {chance}% de chance de fechar positivo
      </p>
    </Link>
  )
}
