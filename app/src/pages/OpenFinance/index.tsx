import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  Loader2,
  RefreshCw,
  Download,
  Unplug,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useAccounts,
  useLiveBalances,
  useOpenFinanceStatus,
  useRelinkOpenFinanceAccount,
  useSyncOpenFinance,
  useSyncRuns,
} from "@/lib/queries"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format"
import { FINANCE, PALETTE, tint } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import {
  SYNC_TRIGGER_LABELS,
  type LiveAccountBalance,
  type OpenFinanceLinkedAccount,
  type SyncRun,
} from "@/types/finance"

// "há 5 min", "há 3 h", "há 2 dias" — a precisão importa aqui (dados de hoje)
function since(iso: string | null) {
  if (!iso) return "nunca"
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return "agora mesmo"
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? "ontem" : `há ${days} dias`
}

export function OpenFinance() {
  const { data: status, isLoading, isError, refetch } = useOpenFinanceStatus()
  const sync = useSyncOpenFinance()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    )
  }
  if (isError || !status) {
    return (
      <ErrorState
        message="Não foi possível carregar o status do Open Finance."
        onRetry={() => refetch()}
      />
    )
  }

  const running = status.running || sync.isPending

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Open Finance
          </h1>
          <p className="text-sm text-muted-foreground">
            Transações sincronizadas do banco; saldo e investimentos sempre ao
            vivo
          </p>
        </div>
        {status.configured && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={running}
              onClick={() => sync.mutate({ refresh: true })}
              title="Pede ao banco uma coleta nova antes de sincronizar (até 2 min)"
            >
              <Download size={15} />
              Buscar no banco
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={running}
              onClick={() => sync.mutate({})}
            >
              <RefreshCw size={15} className={cn(running && "animate-spin")} />
              {running ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
          </div>
        )}
      </div>

      {!status.configured ? (
        <NotConfigured />
      ) : (
        <>
          <ConnectionCard status={status} running={running} />
          <LinkedAccounts accounts={status.accounts} />
          <RunsHistory />
        </>
      )}
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Unplug size={22} />
      </span>
      <p className="font-medium">Open Finance não configurado</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Defina <code className="rounded bg-muted px-1">PLUGGY_CLIENT_ID</code>,{" "}
        <code className="rounded bg-muted px-1">PLUGGY_CLIENT_SECRET</code> e{" "}
        <code className="rounded bg-muted px-1">PLUGGY_ITEM_IDS</code> no{" "}
        <code className="rounded bg-muted px-1">api/.env</code> e reinicie a
        API.
      </p>
    </div>
  )
}

// ── Conexão ───────────────────────────────────────────────────────────────────
function ConnectionCard({
  status,
  running,
}: {
  status: NonNullable<ReturnType<typeof useOpenFinanceStatus>["data"]>
  running: boolean
}) {
  const item = status.items[0]
  const run = status.lastRun
  const failed = run?.status === "error"
  // Verde = em dia; âmbar = dados velhos; vermelho = última sync falhou
  const tone = failed
    ? FINANCE.expense
    : status.stale
      ? PALETTE.amber
      : FINANCE.income
  const label = running
    ? "Sincronizando"
    : failed
      ? "Última sincronização falhou"
      : status.stale
        ? "Dados desatualizados"
        : "Em dia"

  return (
    <div className="relative flex animate-in flex-col gap-5 overflow-hidden rounded-xl border bg-card p-5 duration-500 fade-in slide-in-from-bottom-2 md:flex-row md:items-center md:justify-between">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: tone }}
      />
      <div className="flex items-center gap-4">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: tint(tone), color: tone }}
        >
          <Building2 size={22} />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold tracking-tight">
            {item?.connectorName ?? "Banco"}
            <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
              via Pluggy
            </span>
          </p>
          <span
            className="flex items-center gap-2 text-sm"
            style={{ color: tone }}
          >
            <span className="relative flex size-2">
              {(running || !status.stale) && !failed && (
                <span
                  className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
                  style={{ backgroundColor: tone }}
                />
              )}
              <span
                className="relative inline-flex size-2 rounded-full"
                style={{ backgroundColor: tone }}
              />
            </span>
            {label}
          </span>
          {failed && run?.errorMessage && (
            <p className="max-w-xl text-xs text-muted-foreground">
              {run.errorMessage}
            </p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <Fact
          term="Nossa última sincronização"
          value={since(status.lastSyncedAt)}
        />
        <Fact
          term="Coleta do banco (Pluggy)"
          value={since(item?.providerUpdatedAt ?? null)}
        />
        <Fact
          term="Última completa (12 meses)"
          value={
            item?.lastFullSyncAt
              ? formatDate(item.lastFullSyncAt.slice(0, 10))
              : "—"
          }
        />
      </dl>
    </div>
  )
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

// ── Contas vinculadas com saldo ao vivo ──────────────────────────────────────
function LinkedAccounts({
  accounts,
}: {
  accounts: OpenFinanceLinkedAccount[]
}) {
  const { data: balances, isLoading } = useLiveBalances()

  if (accounts.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        Nenhuma conta vinculada ainda. Ela aparece aqui depois da primeira
        sincronização.
      </p>
    )
  }

  const byProviderId = new Map(
    (balances?.accounts ?? []).map((b) => [b.providerAccountId, b])
  )

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Contas vinculadas</h2>
        {balances && !balances.available && (
          <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle size={13} />
            Saldo indisponível: {balances.error}
          </span>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((account, i) => (
          <LinkedAccountCard
            key={account.id}
            account={account}
            live={byProviderId.get(account.providerAccountId)}
            loading={isLoading}
            delay={i * 60}
          />
        ))}
      </div>
    </section>
  )
}

function LinkedAccountCard({
  account,
  live,
  loading,
  delay,
}: {
  account: OpenFinanceLinkedAccount
  live: LiveAccountBalance | undefined
  loading: boolean
  delay: number
}) {
  const { data: internalAccounts } = useAccounts()
  const relink = useRelinkOpenFinanceAccount()
  const isCard = account.type === "CREDIT"
  const Icon = isCard ? CreditCard : Building2
  const accent = isCard ? PALETTE.violet : PALETTE.emerald

  const usedPct =
    isCard && live?.creditLimit
      ? Math.min(100, (live.balance / live.creditLimit) * 100)
      : null

  return (
    <div
      className="flex animate-in flex-col gap-4 rounded-xl border bg-card p-5 duration-500 fade-in slide-in-from-bottom-2"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: tint(accent), color: accent }}
          >
            <Icon size={18} />
          </span>
          <div>
            <p className="font-medium">
              {isCard ? "Cartão de crédito" : "Conta corrente"}
            </p>
            <p className="text-xs text-muted-foreground">
              {account.name}
              {account.number ? ` · final ${account.number.slice(-4)}` : ""}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          ao vivo
        </span>
      </div>

      {loading ? (
        <Skeleton className="h-9 w-40" />
      ) : live ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {isCard ? "Usado do limite" : "Saldo disponível"}
          </p>
          <p className="text-3xl font-bold tabular-nums">
            {formatCurrency(live.balance)}
          </p>
          {usedPct != null && (
            <>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-valuenow={Math.round(usedPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Uso do limite"
              >
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${usedPct}%`,
                    backgroundColor: usedPct > 85 ? FINANCE.expense : accent,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {Math.round(usedPct)}% de {formatCurrency(live.creditLimit!)}
                {live.availableCredit != null &&
                  ` · ${formatCurrency(live.availableCredit)} disponível`}
                {/* A Pluggy devolve o vencimento da última fatura; passado não informa nada */}
                {live.dueDate &&
                  live.dueDate >= new Date().toISOString().slice(0, 10) &&
                  ` · vence ${formatDate(live.dueDate)}`}
              </p>
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Saldo indisponível no momento
        </p>
      )}

      <div className="flex items-center gap-2 border-t pt-3">
        <span className="shrink-0 text-xs text-muted-foreground">Lança em</span>
        <Select
          value={account.accountId}
          onValueChange={(accountId) =>
            relink.mutate({ id: account.id, accountId })
          }
          disabled={relink.isPending}
        >
          <SelectTrigger
            size="sm"
            className="h-8 flex-1"
            aria-label="Conta interna vinculada"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(internalAccounts ?? [])
              .filter((a) => !a.isSandbox)
              .map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// ── Histórico ────────────────────────────────────────────────────────────────
function RunsHistory() {
  const { data: runs, isLoading } = useSyncRuns()

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Histórico de sincronizações</h2>
      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : !runs?.length ? (
          <p className="p-5 text-sm text-muted-foreground">
            Nenhuma sincronização ainda.
          </p>
        ) : (
          <ul className="divide-y">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function RunRow({ run }: { run: SyncRun }) {
  const Icon =
    run.status === "running"
      ? Loader2
      : run.status === "error"
        ? XCircle
        : CheckCircle2
  const color =
    run.status === "error"
      ? FINANCE.expense
      : run.status === "running"
        ? FINANCE.neutral
        : FINANCE.income
  const seconds =
    run.finishedAt &&
    (
      (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) /
      1000
    ).toFixed(1)
  const changes = [
    run.created && `${run.created} novas`,
    run.adopted && `${run.adopted} adotadas`,
    run.updated && `${run.updated} atualizadas`,
    run.removed && `${run.removed} removidas`,
  ].filter(Boolean)

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
      <Icon
        size={16}
        className={cn("shrink-0", run.status === "running" && "animate-spin")}
        style={{ color }}
      />
      <span className="w-36 shrink-0 tabular-nums">
        {formatDateTime(run.startedAt)}
      </span>
      <span className="w-28 shrink-0 text-xs text-muted-foreground">
        {SYNC_TRIGGER_LABELS[run.trigger]}
        {run.full ? " · completa" : ""}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {run.status === "error"
          ? run.errorMessage
          : changes.length
            ? changes.join(" · ")
            : `${run.fetched} lidas, nada mudou`}
      </span>
      {seconds && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {seconds}s
        </span>
      )}
    </li>
  )
}
