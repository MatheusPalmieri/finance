import { useMemo, useState } from "react"
import { Area, AreaChart, ResponsiveContainer, ReferenceLine } from "recharts"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Info,
  RefreshCw,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import {
  useCurrentReport,
  useGenerateReport,
  useNarrateReport,
  useReport,
} from "@/lib/queries"
import { formatCurrency, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { FINANCE, tint } from "@/lib/tokens"
import {
  BUDGET_LINE_STATUS_LABELS,
  BUDGET_TYPE_HEX,
  BUDGET_TYPE_LABELS,
  INSIGHT_SEVERITY_HEX,
  MONTHS,
  type Anomaly,
  type BudgetLine,
  type BudgetType,
  type Insight,
  type MonthlyReport,
  type Scalar,
} from "@/types/finance"

const TYPE_ORDER: BudgetType[] = ["essential", "desire", "investment"]

export function Reports() {
  const navigate = useNavigate()

  // `null` = mês anterior ao atual (o atalho /current). Navegar troca para um
  // período explícito, que é gerado sob demanda se ainda não existir.
  const [period, setPeriod] = useState<{ month: number; year: number } | null>(
    null
  )

  const currentQuery = useCurrentReport()
  const generate = useGenerateReport()
  const narrate = useNarrateReport()

  // Ao navegar para outro mês, o relatório é buscado por id depois de gerado
  const [explicitId, setExplicitId] = useState<string | null>(null)
  const explicitQuery = useReport(explicitId)

  const report = period ? explicitQuery.data : currentQuery.data
  const isLoading = period
    ? explicitQuery.isLoading || generate.isPending
    : currentQuery.isLoading
  const isError = period ? explicitQuery.isError : currentQuery.isError

  const shown = useMemo(() => {
    if (period) return period
    if (report) return { month: report.month, year: report.year }
    return null
  }, [period, report])

  function goToMonth(delta: number) {
    const base = shown ?? {
      month: new Date().getMonth(),
      year: new Date().getFullYear(),
    }
    const zeroBased = base.year * 12 + (base.month - 1) + delta
    const next = {
      year: Math.floor(zeroBased / 12),
      month: (zeroBased % 12) + 1,
    }
    setPeriod(next)
    setExplicitId(null)
    generate.mutate(
      next,
      { onSuccess: (r) => setExplicitId(r.id) }
    )
  }

  function regenerate() {
    if (!shown) return
    setExplicitId(null)
    setPeriod(shown)
    generate.mutate(
      shown,
      { onSuccess: (r) => setExplicitId(r.id) }
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Check-up</h1>
          <p className="text-sm text-muted-foreground">
            Relatório mensal com anomalias, orçamentos e 50/30/20
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-card p-0.5">
            <button
              type="button"
              onClick={() => goToMonth(-1)}
              aria-label="Mês anterior"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-36 px-2 text-center text-sm font-medium">
              {shown
                ? `${MONTHS[shown.month - 1]} ${shown.year}`
                : "Carregando..."}
            </span>
            <button
              type="button"
              onClick={() => goToMonth(1)}
              aria-label="Próximo mês"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={regenerate}
            disabled={generate.isPending || !shown}
          >
            <RefreshCw
              size={14}
              className={cn(generate.isPending && "animate-spin")}
            />
            Regerar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <ReportSkeleton />
      ) : isError || !report ? (
        <ErrorState
          message="Não foi possível carregar o check-up."
          onRetry={() =>
            period ? explicitQuery.refetch() : currentQuery.refetch()
          }
        />
      ) : (
        <ReportBody
          report={report}
          onNarrate={() => narrate.mutate(report.id)}
          isNarrating={narrate.isPending}
          onOpenCategory={(categoryId) =>
            navigate(
              `/transactions?categoryId=${categoryId}&from=${report.metrics.period.from}&to=${report.metrics.period.to}`
            )
          }
        />
      )}
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}

function ReportBody({
  report,
  onNarrate,
  isNarrating,
  onOpenCategory,
}: {
  report: MonthlyReport
  onNarrate: () => void
  isNarrating: boolean
  onOpenCategory: (categoryId: string) => void
}) {
  const { metrics, insights } = report
  const { totals } = metrics
  const isEmpty =
    totals.transactionCount.current === 0 && totals.totalIncome.current === 0

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <FileText size={40} className="text-muted-foreground/40" />
        <p className="text-muted-foreground">
          Nenhuma transação em {MONTHS[metrics.period.month - 1]} de{" "}
          {metrics.period.year}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          O check-up aparece assim que houver lançamentos no mês desta carteira.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {metrics.period.partial && (
        <div
          className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs"
          style={{ backgroundColor: tint(FINANCE.essential, 10) }}
        >
          <AlertTriangle size={14} style={{ color: FINANCE.essential }} />
          Mês em andamento — a comparação com o mês anterior ainda está
          enviesada.
        </div>
      )}

      {/* 1. Veredito */}
      <Verdict report={report} />

      {/* 2. Narrativa */}
      <Narrative
        report={report}
        onNarrate={onNarrate}
        isNarrating={isNarrating}
      />

      {/* 3. Insights */}
      {insights.length > 0 && (
        <Section title="O que chamou atenção">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map((insight, i) => (
              <InsightCard
                key={`${insight.kind}-${i}`}
                insight={insight}
                onOpenCategory={onOpenCategory}
              />
            ))}
          </div>
        </Section>
      )}

      {/* 4. 50/30/20 */}
      <Section
        title="Regra 50/30/20"
        subtitle="Realizado contra a meta, sobre o gasto total do mês"
      >
        <DistributionChart distribution={metrics.distribution} />
      </Section>

      {/* 5. Orçamentos */}
      {metrics.budgets.length > 0 && (
        <Section title="Orçamentos" subtitle="Planejado vs. realizado">
          <BudgetTable budgets={metrics.budgets} />
        </Section>
      )}

      {/* 6. Anomalias */}
      {metrics.anomalies.length > 0 && (
        <Section
          title="Categorias fora do padrão"
          subtitle="Comparado com a mediana dos 6 meses anteriores"
        >
          <div className="flex flex-col gap-3">
            {metrics.anomalies.map((anomaly) => (
              <AnomalyCard
                key={anomaly.categoryId}
                anomaly={anomaly}
                onOpen={() => onOpenCategory(anomaly.categoryId)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Estabelecimentos novos */}
      {metrics.newMerchants.length > 0 && (
        <Section title="Onde você gastou pela primeira vez">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.newMerchants.map((merchant) => (
              <div
                key={merchant.merchantKey}
                className="flex items-center gap-3 rounded-xl border bg-card p-3"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: tint(FINANCE.variable, 14),
                    color: FINANCE.variable,
                  }}
                >
                  <Store size={15} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {merchant.label}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(merchant.totalBrl)} ·{" "}
                    {merchant.transactionCount}x
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 7. Assinaturas */}
      {metrics.subscriptions && (
        <Section
          title="Cobranças recorrentes"
          subtitle={`${formatCurrency(metrics.subscriptions.totalMonthlyBrl)}/mês em ${metrics.subscriptions.activeCount} cobrança(s) ativa(s)`}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.subscriptions.priceIncreases.map((serie) => (
              <div
                key={serie.id}
                className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm"
              >
                <span className="truncate">{serie.label}</span>
                <span className="shrink-0 font-medium text-destructive tabular-nums">
                  +{serie.priceChangePct}%
                </span>
              </div>
            ))}
            {metrics.subscriptions.newThisMonth.map((serie) => (
              <div
                key={serie.id}
                className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm"
              >
                <span className="truncate">{serie.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  nova · {formatCurrency(serie.monthlyCostBrl)}/mês
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <p className="text-xs text-muted-foreground">
        Gerado em {formatDate(report.generatedAt.slice(0, 10))} · todos os
        números são calculados a partir das transações do período.
      </p>
    </div>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  )
}

// ── 1. Veredito ───────────────────────────────────────────────────────────────
function Verdict({ report }: { report: MonthlyReport }) {
  const { totals, period } = report.metrics
  const net = totals.netResult.current
  const positive = net >= 0
  const color = positive ? FINANCE.income : FINANCE.expense

  return (
    <div className="flex flex-col gap-4">
      <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Você fechou {MONTHS[period.month - 1].toLowerCase()} com{" "}
        <span style={{ color }} className="tabular-nums">
          {formatCurrency(Math.abs(net))}
        </span>{" "}
        {positive ? "positivos" : "negativos"}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Gasto total"
          scalar={totals.totalExpenses}
          format={formatCurrency}
          goodDirection="down"
        />
        <Tile
          label="Receita"
          scalar={totals.totalIncome}
          format={formatCurrency}
          goodDirection="up"
        />
        <Tile
          label="Resultado"
          scalar={totals.netResult}
          format={formatCurrency}
          goodDirection="up"
        />
        <Tile
          label="Taxa de poupança"
          scalar={{
            current: totals.savingsRate.current ?? 0,
            previous: totals.savingsRate.previous ?? 0,
            deltaPct: totals.savingsRate.deltaPct,
          }}
          format={(n) => `${n.toFixed(1)}%`}
          goodDirection="up"
          empty={totals.savingsRate.current === null}
        />
      </div>
    </div>
  )
}

function Tile({
  label,
  scalar,
  format,
  goodDirection,
  empty,
}: {
  label: string
  scalar: Scalar
  format: (n: number) => string
  goodDirection: "up" | "down"
  empty?: boolean
}) {
  const delta = scalar.deltaPct
  const rising = (delta ?? 0) > 0
  const good = goodDirection === "up" ? rising : !rising
  const Arrow = rising ? ArrowUpRight : ArrowDownRight

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border bg-card p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums">
        {empty ? "—" : format(scalar.current)}
      </span>
      {delta === null || empty ? (
        <span className="text-xs text-muted-foreground">
          sem base de comparação
        </span>
      ) : (
        <span
          className="flex items-center gap-0.5 text-xs font-medium tabular-nums"
          style={{ color: good ? FINANCE.income : FINANCE.expense }}
        >
          <Arrow size={12} />
          {Math.abs(delta).toFixed(1)}% vs. mês anterior
        </span>
      )}
    </div>
  )
}

// ── 2. Narrativa ──────────────────────────────────────────────────────────────
function Narrative({
  report,
  onNarrate,
  isNarrating,
}: {
  report: MonthlyReport
  onNarrate: () => void
  isNarrating: boolean
}) {
  if (report.status !== "NARRATED" || !report.narrative) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card/50 p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles size={15} className="text-muted-foreground" />
          Narrativa indisponível
        </div>
        <p className="max-w-prose text-xs text-muted-foreground">
          {report.status === "NARRATION_FAILED"
            ? "A IA gerou um texto que citava números fora das métricas, então ele foi descartado. Os números acima continuam corretos."
            : report.aiAvailable
              ? "Este relatório ainda não tem texto."
              : "A IA está desligada ou fora do ar. Os números acima não dependem dela."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={onNarrate}
          disabled={isNarrating || !report.aiAvailable}
        >
          <Sparkles size={14} />
          {isNarrating ? "Gerando..." : "Gerar texto"}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <p className="max-w-[65ch] text-sm leading-relaxed whitespace-pre-line">
        {report.narrative}
      </p>

      {report.suggestions && report.suggestions.length > 0 && (
        <ul className="flex flex-col gap-2 border-t pt-4">
          {report.suggestions.map((suggestion, i) => (
            <li key={i} className="flex gap-2.5">
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: FINANCE.income }}
              />
              <div>
                <p className="text-sm font-medium">{suggestion.title}</p>
                <p className="text-xs text-muted-foreground">
                  {suggestion.rationale}
                  {suggestion.estimatedSavingBrl !== null && (
                    <>
                      {" "}
                      <span className="tabular-nums">
                        (~{formatCurrency(suggestion.estimatedSavingBrl)}/mês)
                      </span>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Texto gerado por IA a partir dos números acima
        {report.narrativeModel ? ` · ${report.narrativeModel}` : ""}
      </p>
    </div>
  )
}

// ── 3. Insights ───────────────────────────────────────────────────────────────
const INSIGHT_ICON = {
  critical: AlertTriangle,
  warn: TrendingUp,
  info: Info,
} as const

function InsightCard({
  insight,
  onOpenCategory,
}: {
  insight: Insight
  onOpenCategory: (categoryId: string) => void
}) {
  const color = INSIGHT_SEVERITY_HEX[insight.severity]
  const Icon = INSIGHT_ICON[insight.severity]
  const clickable = !!insight.categoryId

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => insight.categoryId && onOpenCategory(insight.categoryId)}
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-shadow",
        clickable && "hover:shadow-md",
        !clickable && "cursor-default"
      )}
      style={{ borderColor: tint(color, 40) }}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: tint(color, 14), color }}
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-snug font-medium">{insight.title}</p>
        {clickable && (
          <p className="mt-0.5 text-xs text-muted-foreground">Ver transações</p>
        )}
      </div>
    </button>
  )
}

// ── 4. Distribuição 50/30/20 ─────────────────────────────────────────────────
// Barra empilhada realizado sobre barra de meta. Cores vêm de BUDGET_TYPE_HEX
// (lib/tokens.ts) — o contraste dessas cores contra a superfície fica abaixo de
// 3:1 no tema claro, então cada faixa carrega rótulo direto além da legenda.
function DistributionChart({
  distribution,
}: {
  distribution: Record<
    BudgetType,
    { pct: number; targetPct: number; deltaPp: number; amountBrl: number }
  >
}) {
  const hasData = TYPE_ORDER.some((type) => distribution[type].amountBrl > 0)

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      {!hasData ? (
        <p className="text-sm text-muted-foreground">
          Sem despesas no mês para distribuir.
        </p>
      ) : (
        <>
          <StackedBar
            label="Realizado"
            segments={TYPE_ORDER.map((type) => ({
              type,
              pct: distribution[type].pct,
            }))}
          />
          <StackedBar
            label="Meta"
            muted
            segments={TYPE_ORDER.map((type) => ({
              type,
              pct: distribution[type].targetPct,
            }))}
          />

          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-3">
            {TYPE_ORDER.map((type) => {
              const bucket = distribution[type]
              const off = Math.abs(bucket.deltaPp) > 5
              return (
                <div key={type} className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: BUDGET_TYPE_HEX[type] }}
                  />
                  <span className="font-medium">
                    {BUDGET_TYPE_LABELS[type]}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatCurrency(bucket.amountBrl)}
                  </span>
                  <span
                    className="tabular-nums"
                    style={{
                      color: off ? FINANCE.expense : undefined,
                    }}
                  >
                    {bucket.deltaPp > 0 ? "+" : ""}
                    {bucket.deltaPp}pp
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function StackedBar({
  label,
  segments,
  muted,
}: {
  label: string
  segments: { type: BudgetType; pct: number }[]
  muted?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {/* gap-0.5 = o espaçador de 2px entre segmentos adjacentes */}
      <div className="flex h-9 gap-0.5 overflow-hidden rounded-md">
        {segments.map(({ type, pct }) =>
          pct <= 0 ? null : (
            <div
              key={type}
              className="flex items-center justify-center overflow-hidden text-[11px] font-medium text-white tabular-nums"
              style={{
                width: `${pct}%`,
                backgroundColor: BUDGET_TYPE_HEX[type],
                opacity: muted ? 0.45 : 1,
              }}
              title={`${BUDGET_TYPE_LABELS[type]}: ${pct}%`}
            >
              {pct >= 8 ? `${Math.round(pct)}%` : ""}
            </div>
          )
        )}
      </div>
    </div>
  )
}

// ── 5. Orçamentos ─────────────────────────────────────────────────────────────
const BUDGET_STATUS_HEX = {
  over: FINANCE.expense,
  under: FINANCE.variable,
  on_track: FINANCE.income,
  missing: FINANCE.essential,
} as const

function BudgetTable({ budgets }: { budgets: BudgetLine[] }) {
  // Os que exigem atenção primeiro; o que está no alvo desce
  const sorted = [...budgets].sort((a, b) => {
    const rank = { over: 0, missing: 1, under: 2, on_track: 3 }
    return rank[a.status] - rank[b.status] || b.actualBrl - a.actualBrl
  })

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-[1fr_120px_120px_120px] gap-3 border-b bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>Orçamento</span>
        <span className="text-right">Planejado</span>
        <span className="text-right">Realizado</span>
        <span>Situação</span>
      </div>
      <div className="divide-y">
        {sorted.map((line) => {
          const ceiling = line.plannedBrl ?? line.plannedMaxBrl ?? 0
          const progress =
            ceiling > 0 ? Math.min(100, (line.actualBrl / ceiling) * 100) : 0
          const color = BUDGET_STATUS_HEX[line.status]
          return (
            <div
              key={line.budgetId}
              className="grid grid-cols-[1fr_120px_120px_120px] items-center gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{line.name}</p>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
              <span className="text-right text-sm text-muted-foreground tabular-nums">
                {line.amountType === "variable"
                  ? `até ${formatCurrency(line.plannedMaxBrl ?? 0)}`
                  : formatCurrency(line.plannedBrl ?? 0)}
              </span>
              <span className="text-right text-sm tabular-nums">
                {formatCurrency(line.actualBrl)}
              </span>
              <span
                className="w-fit rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: tint(color, 16), color }}
              >
                {BUDGET_LINE_STATUS_LABELS[line.status]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 6. Anomalias ──────────────────────────────────────────────────────────────
function AnomalyCard({
  anomaly,
  onOpen,
}: {
  anomaly: Anomaly
  onOpen: () => void
}) {
  const saving = anomaly.severity === "saving"
  const color = saving ? FINANCE.income : FINANCE.expense
  const diff = anomaly.currentBrl - anomaly.medianBrl

  // Série dos 6 meses anteriores + o mês atual em destaque na ponta
  const data = [
    ...anomaly.history.map((h) => ({ month: h.month, value: h.amountBrl })),
    { month: "atual", value: anomaly.currentBrl },
  ]

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: tint(color, 14), color }}
        >
          {saving ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{anomaly.categoryName}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(anomaly.currentBrl)} · mediana{" "}
            {formatCurrency(anomaly.medianBrl)} ·{" "}
            <span style={{ color }}>
              {diff > 0 ? "+" : ""}
              {formatCurrency(diff)}
            </span>
          </p>
        </div>
      </div>

      {/* Sparkline: 6 meses + o atual, com a mediana como linha de referência */}
      <div className="h-12 w-full sm:w-32">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
          >
            <defs>
              <linearGradient
                id={`spark-${anomaly.categoryId}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <ReferenceLine
              y={anomaly.medianBrl}
              stroke="var(--border)"
              strokeDasharray="2 2"
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#spark-${anomaly.categoryId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5 sm:w-56">
        {anomaly.topTransactions.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span className="truncate">{transaction.name}</span>
            <span className="ml-auto shrink-0 tabular-nums">
              {formatCurrency(transaction.amountBrl)}
            </span>
          </div>
        ))}
        <button
          type="button"
          onClick={onOpen}
          className="mt-1 w-fit text-xs text-primary hover:underline"
        >
          Ver todas
        </button>
      </div>
    </div>
  )
}
