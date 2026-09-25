import { useMemo, useState } from "react"
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  ChevronDown,
  Info,
  Plus,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
} from "lucide-react"
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SegmentedControl } from "@/components/charts"
import {
  useAfford,
  useCashflow,
  useCategories,
  useLlmHealth,
  useParseScenario,
  useSimulate,
} from "@/lib/queries"
import { formatCurrency, formatCurrencyCompact } from "@/lib/format"
import { cn } from "@/lib/utils"
import { FINANCE, PALETTE, tint } from "@/lib/tokens"
import {
  SCENARIO_KIND_LABELS,
  VERDICT_HEX,
  VERDICT_LABELS,
  type AffordResponse,
  type CashflowProjection,
  type ScenarioEvent,
} from "@/types/finance"

/** Cor da curva base (esmeralda) e do cenário (violeta) — par validado para CVD. */
const BASE_HEX = FINANCE.income
const SCENARIO_HEX = PALETTE.violet

const HORIZONS = [3, 6, 12] as const
type Horizon = (typeof HORIZONS)[number]

export function Forecast() {
  const [horizonMonths, setHorizonMonths] = useState<Horizon>(6)
  const [events, setEvents] = useState<ScenarioEvent[]>([])

  const params = useMemo(() => ({ horizonMonths }), [horizonMonths])
  const { data: base, isLoading, isError, refetch } = useCashflow(params)
  const simulate = useSimulate()
  const afford = useAfford()

  // O resultado do cenário vem de `simulate`; `afford` só entra quando há
  // exatamente uma compra parcelada, porque os acionáveis são sobre ela.
  const scenario = simulate.data?.withScenario ?? null
  const verdict = simulate.data?.verdict ?? null
  const actions = afford.data?.actions ?? null

  function runSimulation(next: ScenarioEvent[]) {
    setEvents(next)
    if (next.length === 0) {
      simulate.reset()
      afford.reset()
      return
    }

    simulate.mutate({ horizonMonths, events: next })

    const purchases = next.filter((e) => e.kind === "installment_purchase")
    if (purchases.length === 1 && next.length === 1) {
      const purchase = purchases[0] as Extract<
        ScenarioEvent,
        { kind: "installment_purchase" }
      >
      afford.mutate({
        horizonMonths,
        totalAmount: purchase.totalAmount,
        installments: purchase.installments,
        monthlyInterestPct: purchase.monthlyInterestPct,
        label: purchase.label,
        categoryId: purchase.categoryId ?? null,
      })
    } else {
      afford.reset()
    }
  }

  const panel = (
    <ScenarioPanel
      events={events}
      isPending={simulate.isPending}
      onChange={runSimulation}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projeção</h1>
          <p className="text-sm text-muted-foreground">
            Para onde o saldo vai, e se dá pra comprar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl<string>
            value={String(horizonMonths)}
            onChange={(v) => setHorizonMonths(Number(v) as Horizon)}
            options={HORIZONS.map((h) => ({
              value: String(h),
              label: `${h}m`,
            }))}
          />
          {/* Em telas pequenas o painel de cenário vira drawer */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 lg:hidden">
                <SlidersHorizontal size={14} />
                Simular
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Simular um cenário</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">{panel}</div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {isLoading ? (
        <ForecastSkeleton />
      ) : isError || !base ? (
        <ErrorState
          message="Não foi possível carregar a projeção."
          onRetry={() => refetch()}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-6">
            <ConfidenceWarning projection={base} />
            <HorizonVerdict projection={base} />
            <FanChart base={base} scenario={scenario} />
            {verdict && (
              <ResultCard
                verdict={verdict}
                actions={actions}
                afford={afford.data ?? null}
                onApply={(patch) => {
                  const purchase = events.find(
                    (e) => e.kind === "installment_purchase"
                  ) as
                    | Extract<ScenarioEvent, { kind: "installment_purchase" }>
                    | undefined
                  if (!purchase) return
                  runSimulation([{ ...purchase, ...patch }])
                }}
              />
            )}
            <MonthlyTable projection={scenario ?? base} />
            <AssumptionsCard projection={base} />
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-4">{panel}</div>
          </aside>
        </div>
      )}
    </div>
  )
}

function ForecastSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}

// ── Avisos de confiança ───────────────────────────────────────────────────────
function ConfidenceWarning({ projection }: { projection: CashflowProjection }) {
  const { assumptions } = projection
  const shortHistory = assumptions.historyMonths < 3
  const noIncome = assumptions.recurringIncome.sources.length === 0

  if (!shortHistory && !noIncome) return null

  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs"
      style={{ backgroundColor: tint(FINANCE.essential, 10) }}
    >
      <AlertTriangle
        size={15}
        className="mt-0.5 shrink-0"
        style={{ color: FINANCE.essential }}
      />
      <div className="flex flex-col gap-1">
        {shortHistory && (
          <p>
            <strong>Projeção baseada em pouco histórico</strong> —{" "}
            {assumptions.historyMonths}{" "}
            {assumptions.historyMonths === 1 ? "mês" : "meses"} de lançamentos.
            Trate os números como ordem de grandeza, não como previsão.
          </p>
        )}
        {noIncome && (
          <p>
            <strong>Nenhuma receita recorrente detectada</strong> — a projeção
            está contando só as saídas, por isso o saldo despenca. Uma entrada
            precisa aparecer em ao menos 4 dos últimos 6 meses para ser
            considerada recorrente.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Veredito do horizonte ─────────────────────────────────────────────────────
function HorizonVerdict({ projection }: { projection: CashflowProjection }) {
  const { probAnyNegative, minBalanceP10 } = projection.summary
  const positiveChance = Math.round((1 - probAnyNegative) * 100)
  const good = probAnyNegative < 0.25
  const color = good ? FINANCE.income : FINANCE.expense

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-4"
      style={{ borderColor: tint(color, 40) }}
    >
      <div>
        <p className="text-lg font-semibold tracking-tight">
          <span style={{ color }} className="tabular-nums">
            {positiveChance}%
          </span>{" "}
          de chance de fechar os {projection.months.length} meses sempre no
          positivo
        </p>
        <p className="text-xs text-muted-foreground">
          No pior cenário (p10) o saldo chega a{" "}
          <span className="tabular-nums">{formatCurrency(minBalanceP10)}</span>{" "}
          em {projection.summary.worstMonthLabel}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-muted-foreground">
          Saldo hoje
          {projection.openingBalanceSource === "stale" && " · desatualizado"}
          {projection.openingBalanceSource === "unavailable" &&
            " · sem Open Finance"}
        </p>
        <p className="text-xl font-bold tabular-nums">
          {formatCurrency(projection.openingBalance)}
        </p>
      </div>
    </div>
  )
}

// ── Gráfico de leque ──────────────────────────────────────────────────────────
// Uma única matiz (esmeralda) em opacidades crescentes para dentro: a banda é
// uma codificação sequencial de incerteza, não categorias. A curva do cenário
// entra em violeta — par validado para daltonismo contra a base.
function FanChart({
  base,
  scenario,
}: {
  base: CashflowProjection
  scenario: CashflowProjection | null
}) {
  const data = useMemo(() => {
    const opening = {
      label: "hoje",
      band1090: [base.openingBalance, base.openingBalance] as [number, number],
      band2575: [base.openingBalance, base.openingBalance] as [number, number],
      p50: base.openingBalance,
      scenarioP50: scenario ? base.openingBalance : undefined,
      probNegative: 0,
    }
    const months = base.months.map((month, i) => ({
      label: month.label,
      band1090: [month.balance.p10, month.balance.p90] as [number, number],
      band2575: [month.balance.p25, month.balance.p75] as [number, number],
      p50: month.balance.p50,
      scenarioP50: scenario?.months[i]?.balance.p50,
      probNegative: month.probNegative,
    }))
    return [opening, ...months]
  }, [base, scenario])

  const reserve = base.assumptions.minimumReserveBrl

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Saldo projetado</h2>
          <p className="text-xs text-muted-foreground">
            A faixa mostra o intervalo provável; a linha, o cenário mediano
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <LegendItem color={BASE_HEX} label="Projeção atual" />
          {scenario && (
            <LegendItem color={SCENARIO_HEX} label="Com o cenário" dashed />
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
        >
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatCurrencyCompact}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip content={<FanTooltip hasScenario={!!scenario} />} />

          {/* Zero e reserva mínima: as duas referências que importam */}
          <ReferenceLine y={0} stroke={FINANCE.expense} strokeWidth={1.5} />
          {reserve > 0 && (
            <ReferenceLine
              y={reserve}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value: "reserva",
                position: "insideTopLeft",
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
          )}

          <Area
            dataKey="band1090"
            stroke="none"
            fill={BASE_HEX}
            fillOpacity={0.12}
            isAnimationActive={false}
          />
          <Area
            dataKey="band2575"
            stroke="none"
            fill={BASE_HEX}
            fillOpacity={0.22}
            isAnimationActive={false}
          />
          <Line
            dataKey="p50"
            stroke={BASE_HEX}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {scenario && (
            <Line
              dataKey="scenarioP50"
              stroke={SCENARIO_HEX}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function LegendItem({
  color,
  label,
  dashed,
}: {
  color: string
  label: string
  dashed?: boolean
}) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span
        className="h-0.5 w-4 rounded-full"
        style={{
          backgroundColor: dashed ? "transparent" : color,
          borderTop: dashed ? `2px dashed ${color}` : undefined,
        }}
      />
      {label}
    </span>
  )
}

interface FanPoint {
  label: string
  band1090: [number, number]
  band2575: [number, number]
  p50: number
  scenarioP50?: number
  probNegative: number
}

function FanTooltip({
  active,
  payload,
  hasScenario,
}: {
  active?: boolean
  payload?: { payload: FanPoint }[]
  hasScenario: boolean
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{point.label}</p>
      <Row label="Provável" value={formatCurrency(point.p50)} bold />
      {hasScenario && point.scenarioP50 !== undefined && (
        <Row
          label="Com o cenário"
          value={formatCurrency(point.scenarioP50)}
          color={SCENARIO_HEX}
        />
      )}
      <Row
        label="Faixa provável"
        value={`${formatCurrencyCompact(point.band2575[0])} – ${formatCurrencyCompact(point.band2575[1])}`}
      />
      <Row label="Pessimista (p10)" value={formatCurrency(point.band1090[0])} />
      {point.probNegative > 0 && (
        <Row
          label="Risco de negativar"
          value={`${Math.round(point.probNegative * 100)}%`}
          color={FINANCE.expense}
        />
      )}
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  color,
}: {
  label: string
  value: string
  bold?: boolean
  color?: string
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn("ml-auto tabular-nums", bold && "font-medium")}
        style={{ color }}
      >
        {value}
      </span>
    </div>
  )
}

// ── Tabela mês a mês ──────────────────────────────────────────────────────────
function MonthlyTable({ projection }: { projection: CashflowProjection }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-[72px_1fr_1fr_1fr_84px] gap-3 border-b bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>Mês</span>
        <span className="text-right">Receita</span>
        <span className="text-right">Saídas</span>
        <span className="text-right">Saldo provável</span>
        <span className="text-right">Risco</span>
      </div>
      <div className="divide-y">
        {projection.months.map((month) => {
          const outflow =
            month.fixedExpenses +
            month.variableExpensesP50 +
            month.knownTransactions +
            month.scenarioImpact
          const isOpen = expanded === month.label
          const risky = month.probNegative > 0.25

          return (
            <div key={`${month.year}-${month.month}`}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : month.label)}
                className={cn(
                  "grid w-full grid-cols-[72px_1fr_1fr_1fr_84px] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40",
                  risky && "bg-destructive/5"
                )}
              >
                <span className="flex items-center gap-1 text-sm font-medium">
                  <ChevronDown
                    size={12}
                    className={cn(
                      "shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                  {month.label}
                </span>
                <span className="text-right text-sm text-muted-foreground tabular-nums">
                  {formatCurrency(month.expectedIncome)}
                </span>
                <span className="text-right text-sm text-muted-foreground tabular-nums">
                  {formatCurrency(outflow)}
                </span>
                <span
                  className="text-right text-sm font-medium tabular-nums"
                  style={{
                    color: month.balance.p50 < 0 ? FINANCE.expense : undefined,
                  }}
                >
                  {formatCurrency(month.balance.p50)}
                </span>
                <span className="flex items-center justify-end gap-1.5">
                  <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(2, month.probNegative * 100)}%`,
                        backgroundColor: risky
                          ? FINANCE.expense
                          : FINANCE.essential,
                      }}
                    />
                  </span>
                  <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
                    {Math.round(month.probNegative * 100)}%
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="grid gap-2 bg-muted/30 px-4 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <Detail label="Gastos recorrentes" value={month.fixedExpenses} />
                  <Detail
                    label="Avulsos (provável)"
                    value={month.variableExpensesP50}
                  />
                  <Detail
                    label="Já lançado no futuro"
                    value={month.knownTransactions}
                  />
                  <Detail
                    label="Cenário simulado"
                    value={month.scenarioImpact}
                  />
                  <Detail
                    label="Pessimista (p10)"
                    value={month.balance.p10}
                    plain
                  />
                  <Detail
                    label="Otimista (p90)"
                    value={month.balance.p90}
                    plain
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Detail({
  label,
  value,
  plain,
}: {
  label: string
  value: number
  plain?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", !plain && "font-medium")}>
        {formatCurrency(value)}
      </span>
    </div>
  )
}

// ── Card de resultado ─────────────────────────────────────────────────────────
function ResultCard({
  verdict,
  actions,
  afford,
  onApply,
}: {
  verdict: NonNullable<AffordResponse["verdict"]>
  actions: AffordResponse["actions"] | null
  afford: AffordResponse | null
  onApply: (
    patch: Partial<Extract<ScenarioEvent, { kind: "installment_purchase" }>>
  ) => void
}) {
  const color = VERDICT_HEX[verdict.verdict]
  const purchase =
    afford?.event.kind === "installment_purchase" ? afford.event : null

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border p-5"
      style={{ borderColor: tint(color, 45), backgroundColor: tint(color, 6) }}
    >
      <div>
        <p className="text-xl font-semibold tracking-tight" style={{ color }}>
          {VERDICT_LABELS[verdict.verdict]}
        </p>
        <p className="text-sm text-muted-foreground">{verdict.reason}</p>
      </div>

      {actions && purchase && (
        <div className="flex flex-wrap gap-2">
          {actions.maxAffordableTotal !== null &&
            actions.maxAffordableTotal > 0 &&
            actions.maxAffordableTotal !== purchase.totalAmount && (
              <ActionChip
                label={`Teto seguro: ${formatCurrency(actions.maxAffordableTotal)}`}
                onClick={() =>
                  onApply({ totalAmount: actions.maxAffordableTotal! })
                }
              />
            )}
          {actions.saferInstallments !== null &&
            actions.saferInstallments !== purchase.installments && (
              <ActionChip
                label={`Em ${actions.saferInstallments}x fica tranquilo`}
                onClick={() =>
                  onApply({ installments: actions.saferInstallments! })
                }
              />
            )}
          {actions.bestStartMonth !== null &&
            actions.bestStartMonth !== purchase.startMonth && (
              <ActionChip
                label={`Melhor começar em ${actions.bestStartMonth}`}
                onClick={() => onApply({ startMonth: actions.bestStartMonth! })}
              />
            )}
        </div>
      )}
    </div>
  )
}

function ActionChip({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
    >
      {label}
    </button>
  )
}

// ── Painel de cenário ─────────────────────────────────────────────────────────
const INSTALLMENT_OPTIONS = [1, 2, 3, 6, 10, 12]
const NONE = "__none__"

function ScenarioPanel({
  events,
  isPending,
  onChange,
}: {
  events: ScenarioEvent[]
  isPending: boolean
  onChange: (events: ScenarioEvent[]) => void
}) {
  const { data: categories } = useCategories()
  const { data: health } = useLlmHealth()
  const parse = useParseScenario()

  const [text, setText] = useState("")
  const [label, setLabel] = useState("")
  const [amount, setAmount] = useState("")
  const [installments, setInstallments] = useState(1)
  const [interest, setInterest] = useState("")
  const [categoryId, setCategoryId] = useState("")

  const aiAvailable = health?.available ?? false

  function handleParse() {
    if (!text.trim()) return
    parse.mutate(text, {
      onSuccess: (result) => {
        const first = result.events.find(
          (e) => e.kind === "installment_purchase"
        ) as
          | Extract<ScenarioEvent, { kind: "installment_purchase" }>
          | undefined
        if (!first) return
        // A resposta da IA NUNCA é aplicada direto: ela só pré-preenche o
        // formulário, e o usuário confirma clicando em "Adicionar".
        setLabel(first.label)
        setAmount(String(first.totalAmount))
        setInstallments(first.installments)
        setInterest(
          first.monthlyInterestPct ? String(first.monthlyInterestPct) : ""
        )
        setCategoryId(first.categoryId ?? "")
      },
    })
  }

  function addEvent() {
    const total = Number(amount)
    if (!(total > 0)) return
    onChange([
      ...events,
      {
        kind: "installment_purchase",
        label: label.trim() || "Compra",
        totalAmount: total,
        installments,
        monthlyInterestPct: Number(interest) || 0,
        categoryId: categoryId || null,
      },
    ])
    setLabel("")
    setAmount("")
    setInstallments(1)
    setInterest("")
    setCategoryId("")
    setText("")
    parse.reset()
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">Simular um cenário</h2>
        <p className="text-xs text-muted-foreground">
          Veja o impacto antes de comprar
        </p>
      </div>

      {/* Entrada em linguagem natural — some quando a IA está fora */}
      {aiAvailable && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">
            O que você está pensando em comprar?
          </Label>
          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleParse()}
              placeholder="um notebook de 4 mil em 10x"
              className="text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleParse}
              disabled={parse.isPending || !text.trim()}
              aria-label="Interpretar frase"
            >
              <Sparkles
                size={14}
                className={cn(parse.isPending && "animate-pulse")}
              />
            </Button>
          </div>
          {parse.data?.interpretation && (
            <p className="text-xs text-muted-foreground">
              Entendi assim: {parse.data.interpretation} — confira os campos
              abaixo antes de adicionar.
            </p>
          )}
        </div>
      )}

      {/* Formulário: a via principal, sempre presente */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">O quê</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Notebook"
            className="text-xs"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Valor (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="4000"
              className="text-xs tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Juros (% a.m.)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="0"
              className="text-xs tabular-nums"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Parcelas</Label>
          <div className="flex gap-1">
            {INSTALLMENT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setInstallments(n)}
                className={cn(
                  "flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors",
                  installments === n
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {n}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Categoria</Label>
          <Select
            value={categoryId || NONE}
            onValueChange={(v) => setCategoryId(v === NONE ? "" : v)}
          >
            <SelectTrigger className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Não definir</SelectItem>
              {categories?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          size="sm"
          className="gap-2"
          onClick={addEvent}
          disabled={!(Number(amount) > 0) || isPending}
        >
          <Plus size={14} />
          {isPending ? "Simulando..." : "Adicionar e simular"}
        </Button>
      </div>

      {/* Eventos empilhados */}
      {events.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-3">
          <p className="text-xs font-medium">No cenário</p>
          {events.map((event, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">
                {event.label}
                <span className="text-muted-foreground">
                  {" · "}
                  {SCENARIO_KIND_LABELS[event.kind]}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onChange(events.filter((_, j) => j !== i))}
                aria-label={`Remover ${event.label}`}
                className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Premissas ─────────────────────────────────────────────────────────────────
function AssumptionsCard({ projection }: { projection: CashflowProjection }) {
  const [open, setOpen] = useState(false)
  const { assumptions } = projection

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-medium"
      >
        <Info size={14} className="text-muted-foreground" />
        Como esta projeção foi feita
        <ChevronDown
          size={14}
          className={cn(
            "ml-auto text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t px-5 py-4 text-xs">
          <p className="text-muted-foreground">
            {assumptions.simulationRuns.toLocaleString("pt-BR")} simulações
            sorteando o gasto de cada categoria a partir dos últimos meses
            reais. A mesma projeção sempre devolve os mesmos números.
          </p>

          <Assumption label="Histórico usado">
            {assumptions.historyMonths}{" "}
            {assumptions.historyMonths === 1 ? "mês" : "meses"} de lançamentos
          </Assumption>

          <Assumption label="Saldo inicial">
            {formatCurrency(projection.openingBalance)} —{" "}
            {projection.openingAccounts
              .map((a) => `${a.name} ${formatCurrency(a.balance)}`)
              .join(", ")}
            <span className="text-muted-foreground">
              {projection.openingBalanceSource === "open_finance"
                ? " (Open Finance: fatura em aberto descontada e renda fixa com liquidez diária somada ao caixa)"
                : projection.openingBalanceSource === "stale"
                  ? " (último saldo recebido do Open Finance — o banco não respondeu agora)"
                  : " (sem saldo do Open Finance ainda — sincronize para a projeção partir do saldo real)"}
            </span>
          </Assumption>

          <Assumption label="Receita recorrente">
            {assumptions.recurringIncome.sources.length === 0 ? (
              <span className="text-muted-foreground">nenhuma detectada</span>
            ) : (
              assumptions.recurringIncome.sources
                .map(
                  (s) => `${s.label} (${formatCurrency(s.monthlyAmount)}/mês)`
                )
                .join(", ")
            )}
          </Assumption>

          <Assumption label="Reserva mínima">
            {formatCurrency(assumptions.minimumReserveBrl)}
            {assumptions.minimumReserveIsDefault && (
              <span className="text-muted-foreground">
                {" "}
                (calculada: 1 mês de gastos essenciais)
              </span>
            )}
          </Assumption>

          {assumptions.categoriesWithTrend.length > 0 && (
            <Assumption label="Tendências detectadas">
              <span className="flex flex-wrap gap-1.5">
                {assumptions.categoriesWithTrend.map((t) => (
                  <span
                    key={t.categoryName}
                    className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5"
                  >
                    <TrendingUp size={10} />
                    {t.categoryName} {t.monthlyPct > 0 ? "+" : ""}
                    {t.monthlyPct}%/mês
                  </span>
                ))}
              </span>
            </Assumption>
          )}

          {assumptions.lowConfidenceCategories.length > 0 && (
            <Assumption label="Pouco histórico">
              {assumptions.lowConfidenceCategories.join(", ")}
              <span className="text-muted-foreground">
                {" "}
                — entram como média, sem variação
              </span>
            </Assumption>
          )}
        </div>
      )}
    </div>
  )
}

function Assumption({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{label}</span>
      <span>{children}</span>
    </div>
  )
}
