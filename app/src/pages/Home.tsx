import { useMemo } from "react"
import {
  Activity,
  ArrowUpRight,
  MessageCircle,
  TrendingUp,
  Users,
} from "lucide-react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartCard, StatCard } from "@/components/charts"
import { useClientStats, useClients } from "@/lib/queries"
import {
  CLIENT_PHASE_HEX,
  CLIENT_PHASE_LABELS,
  CLOSE_REASON_LABELS,
  type Client,
  type ClientPhase,
  type CloseReason,
} from "@/types/client"

const PHASE_VARIANT: Record<ClientPhase, "default" | "secondary" | "outline"> = {
  PROSPECTING: "secondary",
  NEGOTIATING: "default",
  CLOSED: "secondary",
}

const CLOSE_REASON_VARIANT: Record<CloseReason, "default" | "secondary" | "outline"> = {
  CLIENT: "default",
  TRIAL: "outline",
  CUSTOM_TRIAL: "outline",
  PRICE_OBJECTION: "secondary",
  NO_FIT: "secondary",
  GHOST: "secondary",
  UNREACHABLE: "secondary",
}

const WON: CloseReason[] = ["CLIENT", "TRIAL", "CUSTOM_TRIAL"]
const LOST: CloseReason[] = ["PRICE_OBJECTION", "NO_FIT", "GHOST", "UNREACHABLE"]

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

// Tempo relativo curto em pt-BR
function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const day = 86_400_000
  const days = Math.floor(diff / day)
  if (days <= 0) return "hoje"
  if (days === 1) return "ontem"
  if (days < 30) return `há ${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `há ${months}m`
  return `há ${Math.floor(months / 12)}a`
}

function PhaseBadge({ client }: { client: Client }) {
  const variant = client.closeReason
    ? CLOSE_REASON_VARIANT[client.closeReason]
    : PHASE_VARIANT[client.phase]
  const label = client.closeReason
    ? CLOSE_REASON_LABELS[client.closeReason]
    : CLIENT_PHASE_LABELS[client.phase]
  return (
    <Badge variant={variant} className="shrink-0 text-xs">
      {label}
    </Badge>
  )
}

export function Home() {
  const { data: stats, isLoading: statsLoading } = useClientStats({ period: "all" })
  const { data: recent, isLoading: recentLoading } = useClients({ page: 1, limit: 6 })

  const k = useMemo(() => {
    if (!stats) return null
    const pc = stats.phaseCounts
    const rc = stats.closeReasonCounts
    const won = WON.reduce((a, r) => a + (rc[r] ?? 0), 0)
    const lost = LOST.reduce((a, r) => a + (rc[r] ?? 0), 0)
    const total = stats.total
    return {
      total,
      contacted: stats.contacted,
      contactedPct: total ? (stats.contacted / total) * 100 : 0,
      negotiating: pc.NEGOTIATING ?? 0,
      won,
      lost,
      conversion: total ? (won / total) * 100 : 0,
      phases: [
        { key: "PROSPECTING" as const, value: pc.PROSPECTING ?? 0 },
        { key: "NEGOTIATING" as const, value: pc.NEGOTIATING ?? 0 },
        { key: "CLOSED" as const, value: pc.CLOSED ?? 0 },
      ],
    }
  }, [stats])

  return (
    <div className="flex flex-col gap-8">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Aqui está o resumo da sua base de clientes
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statsLoading || !k ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total de leads"
              value={k.total.toLocaleString("pt-BR")}
              icon={Users}
              accent="#3b82f6"
              delay={0}
            />
            <StatCard
              label="Contatados"
              value={k.contacted.toLocaleString("pt-BR")}
              hint={`${k.contactedPct.toFixed(0)}% da base`}
              icon={MessageCircle}
              accent="#06b6d4"
              delay={60}
            />
            <StatCard
              label="Em negociação"
              value={k.negotiating.toLocaleString("pt-BR")}
              hint="pipeline ativo"
              icon={Activity}
              accent="#f59e0b"
              delay={120}
            />
            <StatCard
              label="Taxa de conversão"
              value={`${k.conversion.toFixed(1)}%`}
              hint={`${k.won} ganhos · ${k.lost} perdidos`}
              icon={TrendingUp}
              accent="#10b981"
              delay={180}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Pipeline */}
        <ChartCard
          title="Pipeline"
          subtitle="Distribuição dos leads por fase"
          className="lg:col-span-3"
          delay={220}
          action={
            <Link
              to="/funnel"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Ver funil
              <ArrowUpRight size={13} />
            </Link>
          }
        >
          {statsLoading || !k ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-3 w-full rounded-full" />
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            </div>
          ) : (
            <PipelineBreakdown phases={k.phases} total={k.total} />
          )}
        </ChartCard>

        {/* Recentes */}
        <ChartCard
          title="Recentes"
          subtitle="Últimos leads adicionados"
          className="lg:col-span-2"
          delay={280}
          action={
            <Link
              to="/clients"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Ver todos
              <ArrowUpRight size={13} />
            </Link>
          }
        >
          <div className="-mx-1 flex flex-col">
            {recentLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-1 py-2.5">
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))
            ) : recent?.data.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhum cliente cadastrado
              </p>
            ) : (
              recent?.data.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.city} · {relativeTime(c.createdAt)}
                    </p>
                  </div>
                  <PhaseBadge client={c} />
                </div>
              ))
            )}
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

// ── Barra de pipeline empilhada + legenda ────────────────────────────────────
function PipelineBreakdown({
  phases,
  total,
}: {
  phases: { key: ClientPhase; value: number }[]
  total: number
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Barra empilhada */}
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {phases.map((p) =>
          p.value > 0 ? (
            <div
              key={p.key}
              className="h-full transition-all duration-700"
              style={{
                width: `${(p.value / total) * 100}%`,
                backgroundColor: CLIENT_PHASE_HEX[p.key],
              }}
              title={`${CLIENT_PHASE_LABELS[p.key]}: ${p.value}`}
            />
          ) : null
        )}
      </div>

      {/* Legenda com contagem e percentual */}
      <div className="grid gap-2 sm:grid-cols-3">
        {phases.map((p) => {
          const pct = total ? (p.value / total) * 100 : 0
          return (
            <div
              key={p.key}
              className="flex flex-col gap-1 rounded-lg border bg-background/40 p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: CLIENT_PHASE_HEX[p.key] }}
                />
                <span className="text-xs text-muted-foreground">
                  {CLIENT_PHASE_LABELS[p.key]}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tabular-nums">{p.value}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {pct.toFixed(0)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
