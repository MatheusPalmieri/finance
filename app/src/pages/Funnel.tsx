import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Funnel as FunnelSeries,
  FunnelChart,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  ChevronRight,
  MapPin,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartCard,
  ChartTooltip,
  SegmentedControl,
  StatCard,
} from "@/components/charts"
import { cn } from "@/lib/utils"
import { useClientStats } from "@/lib/queries"
import type { StatsPeriod } from "@/lib/api"
import {
  CLIENT_PHASE_HEX,
  CLOSE_REASON_HEX,
  CLOSE_REASON_LABELS,
  CLIENT_PHASE_LABELS,
} from "@/types/client"

type FunnelStage = {
  key: string
  label: string
  color: string
  value: number
  ofBase: number
  conv: number
}

const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo" },
]

const ALL_CITIES = "__all__"

export function Funnel() {
  const [period, setPeriod] = useState<StatsPeriod>("30d")
  const [city, setCity] = useState<string>(ALL_CITIES)

  const params = { period, city: city === ALL_CITIES ? undefined : city }
  const { data, isLoading, isFetching, refetch } = useClientStats(params)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Funil de vendas
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe a jornada dos leads em tempo real
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            options={PERIODS}
            value={period}
            onChange={setPeriod}
          />

          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="h-9 w-52 text-sm">
              <MapPin size={13} className="text-muted-foreground" />
              <SelectValue placeholder="Cidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CITIES}>Todas as cidades</SelectItem>
              {(data?.cities ?? []).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => refetch()}
            title="Atualizar"
          >
            <RefreshCw size={14} className={cn(isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : !data || data.total === 0 ? (
        <EmptyState />
      ) : (
        <Dashboard data={data} period={period} />
      )}
    </div>
  )
}

// ── Dashboard principal ─────────────────────────────────────────────────────
function Dashboard({
  data,
  period,
}: {
  data: NonNullable<ReturnType<typeof useClientStats>["data"]>
  period: StatsPeriod
}) {
  const pc = data.phaseCounts
  const rc = data.closeReasonCounts

  const won = (rc.CLIENT ?? 0) + (rc.TRIAL ?? 0) + (rc.CUSTOM_TRIAL ?? 0)
  const pipeline = pc.NEGOTIATING ?? 0
  const lost =
    (rc.PRICE_OBJECTION ?? 0) +
    (rc.NO_FIT ?? 0) +
    (rc.GHOST ?? 0) +
    (rc.UNREACHABLE ?? 0)
  const conversionRate = data.total > 0 ? (won / data.total) * 100 : 0

  const stages = useMemo<FunnelStage[]>(() => {
    const base = data.total
    const negotiatingOrClosed = (pc.NEGOTIATING ?? 0) + (pc.CLOSED ?? 0)

    const raw = [
      { key: "base", label: "Base total", color: "#64748b", value: base },
      {
        key: "contacted",
        label: "Contatados",
        color: "#3b82f6",
        value: data.contacted,
      },
      {
        key: "negotiating",
        label: "Negociando",
        color: "#f59e0b",
        value: negotiatingOrClosed,
      },
      { key: "won", label: "Ganhos", color: "#10b981", value: won },
    ]

    return raw.map((s, i, arr) => ({
      ...s,
      ofBase: base > 0 ? (s.value / base) * 100 : 0,
      conv:
        i === 0
          ? 100
          : arr[i - 1].value > 0
            ? (s.value / arr[i - 1].value) * 100
            : 0,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const distributionData = useMemo(() => {
    const items = [
      {
        key: "PROSPECTING",
        name: CLIENT_PHASE_LABELS.PROSPECTING,
        value: pc.PROSPECTING ?? 0,
        color: CLIENT_PHASE_HEX.PROSPECTING,
      },
      {
        key: "NEGOTIATING",
        name: CLIENT_PHASE_LABELS.NEGOTIATING,
        value: pc.NEGOTIATING ?? 0,
        color: CLIENT_PHASE_HEX.NEGOTIATING,
      },
      {
        key: "CLIENT",
        name: CLOSE_REASON_LABELS.CLIENT,
        value: rc.CLIENT ?? 0,
        color: CLOSE_REASON_HEX.CLIENT,
      },
      {
        key: "TRIAL",
        name: CLOSE_REASON_LABELS.TRIAL,
        value: rc.TRIAL ?? 0,
        color: CLOSE_REASON_HEX.TRIAL,
      },
      {
        key: "CUSTOM_TRIAL",
        name: CLOSE_REASON_LABELS.CUSTOM_TRIAL,
        value: rc.CUSTOM_TRIAL ?? 0,
        color: CLOSE_REASON_HEX.CUSTOM_TRIAL,
      },
      {
        key: "PRICE_OBJECTION",
        name: CLOSE_REASON_LABELS.PRICE_OBJECTION,
        value: rc.PRICE_OBJECTION ?? 0,
        color: CLOSE_REASON_HEX.PRICE_OBJECTION,
      },
      {
        key: "NO_FIT",
        name: CLOSE_REASON_LABELS.NO_FIT,
        value: rc.NO_FIT ?? 0,
        color: CLOSE_REASON_HEX.NO_FIT,
      },
      {
        key: "GHOST",
        name: CLOSE_REASON_LABELS.GHOST,
        value: rc.GHOST ?? 0,
        color: CLOSE_REASON_HEX.GHOST,
      },
      {
        key: "UNREACHABLE",
        name: CLOSE_REASON_LABELS.UNREACHABLE,
        value: rc.UNREACHABLE ?? 0,
        color: CLOSE_REASON_HEX.UNREACHABLE,
      },
    ]
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const timeline = useMemo(
    () => buildTimeline(data.timeline, period),
    [data, period]
  )

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total de leads"
          value={data.total}
          icon={Users}
          accent="#3b82f6"
          delay={0}
        />
        <StatCard
          label="Pipeline ativo"
          value={pipeline}
          hint="em negociação"
          icon={Activity}
          accent="#f59e0b"
          delay={60}
        />
        <StatCard
          label="Ganhos"
          value={won}
          hint={`${lost} perdidos`}
          icon={Target}
          accent="#10b981"
          delay={120}
        />
        <StatCard
          label="Taxa de conversão"
          value={`${conversionRate.toFixed(1)}%`}
          hint="ganhos / total"
          icon={TrendingUp}
          accent="#8b5cf6"
          delay={180}
        />
      </div>

      {/* Funil + distribuição */}
      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard
          title="Funil de conversão"
          subtitle="Progressão dos leads por etapa"
          className="lg:col-span-3"
          delay={220}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip content={<FunnelTooltip />} />
                  <FunnelSeries
                    dataKey="value"
                    data={stages}
                    isAnimationActive
                    animationDuration={700}
                    stroke="var(--background)"
                    strokeWidth={2}
                  >
                    {stages.map((s) => (
                      <Cell key={s.key} fill={s.color} />
                    ))}
                  </FunnelSeries>
                </FunnelChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-col justify-center gap-1.5">
              {stages.map((s, i) => (
                <div key={s.key} className="group">
                  {i > 0 && (
                    <div className="flex items-center gap-1 pl-1 text-[10px] text-muted-foreground">
                      <ChevronRight size={10} />
                      <span>{s.conv.toFixed(0)}% de conversão</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-sm">{s.label}</span>
                    <span className="ml-auto text-sm font-semibold tabular-nums">
                      {s.value}
                    </span>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                      {s.ofBase.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Distribuição por fase"
          subtitle={`${distributionData.length} categorias ativas`}
          className="lg:col-span-2"
          delay={280}
        >
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="relative h-48 w-48 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<ChartTooltip />} />
                  <Pie
                    data={distributionData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="var(--background)"
                    strokeWidth={2}
                    isAnimationActive
                    animationDuration={700}
                  >
                    {distributionData.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums">
                  {data.total}
                </span>
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  leads
                </span>
              </div>
            </div>

            <div className="flex w-full flex-col gap-1">
              {distributionData.map((d) => (
                <div key={d.key} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="truncate text-muted-foreground">
                    {d.name}
                  </span>
                  <span className="ml-auto font-medium tabular-nums">
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Série temporal + top cidades */}
      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard
          title="Leads ao longo do tempo"
          subtitle="Novos leads por dia"
          className="lg:col-span-3"
          delay={320}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={timeline}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="leadGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip content={<ChartTooltip suffix=" leads" />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Novos leads"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#leadGradient)"
                  isAnimationActive
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Top cidades"
          subtitle="Leads por localização"
          className="lg:col-span-2"
          delay={360}
        >
          {data.byCity.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem dados de cidade
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.byCity}
                  layout="vertical"
                  margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                >
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="city"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={88}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    content={<ChartTooltip suffix=" leads" />}
                  />
                  <Bar
                    dataKey="count"
                    name="Leads"
                    fill="#6366f1"
                    radius={[0, 4, 4, 0]}
                    isAnimationActive
                    animationDuration={700}
                  >
                    <LabelList
                      dataKey="count"
                      position="right"
                      className="fill-foreground"
                      fontSize={11}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// ── Componentes auxiliares ──────────────────────────────────────────────────
function FunnelTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: {
    payload?: {
      label?: string
      value?: number
      color?: string
      ofBase?: number
    }
  }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: d.color }}
        />
        <span className="font-medium text-popover-foreground">{d.label}</span>
      </div>
      <p className="mt-1 text-muted-foreground">
        <span className="font-semibold text-popover-foreground tabular-nums">
          {d.value}
        </span>{" "}
        leads · {d.ofBase?.toFixed(0)}% da base
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Users size={22} />
      </span>
      <div>
        <p className="font-medium">Nenhum lead no período</p>
        <p className="text-sm text-muted-foreground">
          Ajuste o filtro de período ou cadastre clientes.
        </p>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-80 rounded-xl lg:col-span-3" />
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-80 rounded-xl lg:col-span-3" />
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function buildTimeline(
  raw: { date: string; count: number }[],
  period: StatsPeriod
) {
  const fmt = (key: string) => {
    const [, m, d] = key.split("-")
    return `${d}/${m}`
  }

  if (period === "all") {
    return raw.map((t) => ({
      date: t.date,
      label: fmt(t.date),
      count: t.count,
    }))
  }

  const map = new Map(raw.map((t) => [t.date, t.count]))
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30
  const out: { date: string; label: string; count: number }[] = []
  const today = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    out.push({ date: key, label: fmt(key), count: map.get(key) ?? 0 })
  }
  return out
}
