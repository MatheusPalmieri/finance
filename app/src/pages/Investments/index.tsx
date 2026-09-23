import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Coins,
  Droplets,
  Landmark,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/charts"
import { api } from "@/lib/api"
import { keys, useLiveInvestments } from "@/lib/queries"
import { formatCurrency, formatDate, formatMonthLabel } from "@/lib/format"
import { FINANCE, PALETTE, tint } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import {
  ASSET_CLASS_HEX,
  type InvestmentClass,
  type InvestmentPosition,
  type LiveInvestments,
} from "@/types/finance"

function signed(value: number) {
  return `${value >= 0 ? "+" : "−"}${formatCurrency(Math.abs(value))}`
}

export function Investments() {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useLiveInvestments()
  const [refreshing, setRefreshing] = useState(false)

  // Ignora o cache de 5 min do backend
  async function refreshNow() {
    setRefreshing(true)
    try {
      qc.setQueryData(
        keys.openFinance.investments(),
        await api.openFinance.investments(true)
      )
    } finally {
      setRefreshing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <ErrorState
        message="Não foi possível carregar os investimentos."
        onRetry={() => refetch()}
      />
    )
  }
  if (!data.available) {
    return (
      <div className="flex flex-col gap-6">
        <Header data={data} refreshing={refreshing} onRefresh={refreshNow} />
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
          <Landmark size={22} className="text-muted-foreground" />
          <p className="font-medium">Investimentos indisponíveis</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Eles vêm ao vivo do Open Finance e nunca são guardados no app.
            Motivo: {data.error}
          </p>
        </div>
      </div>
    )
  }

  const profitPct = data.invested > 0 ? (data.profit / data.invested) * 100 : 0

  return (
    <div className="flex flex-col gap-6">
      <Header data={data} refreshing={refreshing} onRefresh={refreshNow} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Patrimônio investido"
          value={formatCurrency(data.total)}
          icon={Wallet}
          accent={PALETTE.emerald}
          hint={`${data.positions.length} posições ativas`}
        />
        <StatCard
          label="Valor aplicado"
          value={formatCurrency(data.invested)}
          icon={Coins}
          accent={PALETTE.blue}
          hint="renda fixa + custo médio da variável"
          delay={60}
        />
        <StatCard
          label="Rendimento"
          value={signed(data.profit)}
          delta={`${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(2)}%`}
          trend={data.profit >= 0 ? "up" : "down"}
          icon={TrendingUp}
          accent={data.profit >= 0 ? FINANCE.income : FINANCE.expense}
          hint="líquido de IR na renda fixa"
          delay={120}
        />
        <StatCard
          label="Liquidez diária"
          value={formatCurrency(data.liquid)}
          icon={Droplets}
          accent={PALETTE.cyan}
          hint="conta como caixa na projeção"
          delay={180}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Allocation data={data} />
        <Income data={data} />
      </div>

      <Positions positions={data.positions} />
    </div>
  )
}

function Header({
  data,
  refreshing,
  onRefresh,
}: {
  data: LiveInvestments
  refreshing: boolean
  onRefresh: () => void
}) {
  const time = new Date(data.fetchedAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Investimentos</h1>
        <p className="text-sm text-muted-foreground">
          Ao vivo do Open Finance · consultado às {time}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCw size={15} className={cn(refreshing && "animate-spin")} />
        Atualizar
      </Button>
    </div>
  )
}

// ── Alocação: barra empilhada + legenda ──────────────────────────────────────
function Allocation({ data }: { data: LiveInvestments }) {
  return (
    <div className="flex animate-in flex-col gap-4 rounded-xl border bg-card p-5 duration-500 fade-in slide-in-from-bottom-2 lg:col-span-2">
      <div>
        <h2 className="text-sm font-semibold">Alocação</h2>
        <p className="text-xs text-muted-foreground">Por classe de ativo</p>
      </div>
      <div
        className="flex h-4 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label="Alocação por classe"
      >
        {data.byClass.map((c) => (
          <div
            key={c.assetClass}
            className="h-full transition-[width] duration-700 first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${c.pct}%`,
              backgroundColor: ASSET_CLASS_HEX[c.assetClass],
            }}
            title={`${c.assetClass}: ${c.pct}%`}
          />
        ))}
      </div>
      <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {data.byClass.map((c) => (
          <li key={c.assetClass} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: ASSET_CLASS_HEX[c.assetClass] }}
            />
            <span className="flex-1">{c.assetClass}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {c.pct.toFixed(1)}%
            </span>
            <span className="w-28 text-right font-medium tabular-nums">
              {formatCurrency(c.total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Proventos ────────────────────────────────────────────────────────────────
function Income({ data }: { data: LiveInvestments }) {
  const months = data.income.byMonth.slice(-6)
  const max = Math.max(...months.map((m) => m.total), 0)
  return (
    <div className="flex animate-in flex-col gap-4 rounded-xl border bg-card p-5 duration-500 fade-in slide-in-from-bottom-2">
      <div>
        <h2 className="text-sm font-semibold">Proventos</h2>
        <p className="text-xs text-muted-foreground">
          FIIs, ações e BDRs · últimos 12 meses
        </p>
      </div>
      <p
        className="text-2xl font-bold tabular-nums"
        style={{ color: FINANCE.income }}
      >
        {formatCurrency(data.income.last12m)}
      </p>
      {months.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum provento no período.
        </p>
      ) : (
        <div className="flex h-24 items-end gap-2">
          {months.map((m) => (
            <div
              key={m.month}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${formatMonthLabel(m.month)}: ${formatCurrency(m.total)}`}
            >
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {m.total.toFixed(0)}
              </span>
              <div
                className="w-full rounded-t-md"
                style={{
                  height: `${max > 0 ? Math.max(4, (m.total / max) * 64) : 4}px`,
                  backgroundColor: tint(FINANCE.income, 60),
                }}
              />
              <span className="text-[10px] text-muted-foreground">
                {formatMonthLabel(m.month).split(" ")[0]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Posições por classe ──────────────────────────────────────────────────────
function Positions({ positions }: { positions: InvestmentPosition[] }) {
  const groups = new Map<InvestmentClass, InvestmentPosition[]>()
  for (const p of positions)
    groups.set(p.assetClass, [...(groups.get(p.assetClass) ?? []), p])

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Posições</h2>
      <div className="overflow-hidden rounded-xl border bg-card">
        {[...groups].map(([assetClass, items]) => (
          <div key={assetClass}>
            <div
              className="flex items-center gap-2 border-b px-4 py-2 text-xs font-semibold"
              style={{
                backgroundColor: tint(ASSET_CLASS_HEX[assetClass], 8),
                color: ASSET_CLASS_HEX[assetClass],
              }}
            >
              {assetClass}
              <span className="font-normal text-muted-foreground">
                {items.length} {items.length === 1 ? "posição" : "posições"}
              </span>
            </div>
            <ul className="divide-y">
              {items.map((p) => (
                <PositionRow key={p.id} position={p} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

// "NU FINANCEIRA S.A. - SOCIEDADE DE CREDITO..." → "Nu Financeira"
function shortIssuer(issuer: string | null) {
  if (!issuer) return null
  const head = issuer.split(/ s\.?a\.?| - |,/i)[0].trim()
  return head.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

function PositionRow({ position: p }: { position: InvestmentPosition }) {
  const isFixed = p.assetClass === "Renda fixa"
  // Renda fixa: o nome da Pluggy é o do emissor, igual em todas as linhas —
  // título pelo que diferencia (produto e taxa)
  const title = isFixed
    ? [
        p.subtype ?? "Renda fixa",
        p.rate != null && `${p.rate}% ${p.rateType ?? ""}`.trim(),
      ]
        .filter(Boolean)
        .join(" ")
    : (p.code ?? p.name)
  const detail = isFixed
    ? [shortIssuer(p.issuer), p.dueDate && `vence ${formatDate(p.dueDate)}`]
        .filter(Boolean)
        .join(" · ")
    : [
        p.quantity != null && `${p.quantity} cotas`,
        p.price != null && `${formatCurrency(p.price)} hoje`,
        p.averagePrice != null && `PM ${formatCurrency(p.averagePrice)}`,
      ]
        .filter(Boolean)
        .join(" · ")
  const profitColor =
    p.profit == null
      ? undefined
      : p.profit >= 0
        ? FINANCE.income
        : FINANCE.expense

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{title}</p>
          {p.liquid && (
            <span className="shrink-0 rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-600 dark:text-cyan-400">
              Liquidez diária
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {detail || p.issuer || "—"}
        </p>
      </div>
      <div className="flex items-baseline gap-6 text-right">
        {p.invested != null && (
          <div className="hidden sm:block">
            <p className="text-[10px] text-muted-foreground">aplicado</p>
            <p className="text-sm tabular-nums">{formatCurrency(p.invested)}</p>
          </div>
        )}
        <div className="w-28">
          <p className="text-[10px] text-muted-foreground">rendimento</p>
          <p
            className="text-sm font-medium tabular-nums"
            style={{ color: profitColor }}
          >
            {p.profit == null ? "—" : `${signed(p.profit)}`}
            {p.profitPct != null && (
              <span className="ml-1 text-[10px]">
                ({p.profitPct.toFixed(1)}%)
              </span>
            )}
          </p>
        </div>
        <div className="w-28">
          <p className="text-[10px] text-muted-foreground">atual</p>
          <p className="text-sm font-semibold tabular-nums">
            {formatCurrency(p.balance)}
          </p>
        </div>
      </div>
    </li>
  )
}
