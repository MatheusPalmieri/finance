import { useState, type FormEventHandler } from "react"
import {
  Building2,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
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
import { FormModal } from "@/components/forms/FormModal"
import { ErrorState } from "@/components/ui/error-state"
import {
  useCreateOpenFinanceConnection,
  useDeleteOpenFinanceConnection,
  useOpenFinanceConnections,
  useOpenFinanceTransactions,
  useSyncOpenFinanceConnection,
} from "@/lib/queries"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  OF_CONNECTION_STATUS_LABELS,
  type OfConnectionStatus,
  type OpenFinanceConnection,
} from "@/types/finance"

const STATUS_TONE: Record<OfConnectionStatus, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-600",
  UPDATING: "bg-blue-500/10 text-blue-600",
  PENDING: "bg-amber-500/10 text-amber-600",
  LOGIN_ERROR: "bg-destructive/10 text-destructive",
  ERROR: "bg-destructive/10 text-destructive",
  DELETED: "bg-muted text-muted-foreground",
}

export function OpenFinance() {
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<OpenFinanceConnection | null>(null)

  const { data: connections, isLoading, isError, refetch } =
    useOpenFinanceConnections()
  const deleteMutation = useDeleteOpenFinanceConnection()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Open Finance</h1>
          <p className="text-sm text-muted-foreground">
            Leitura de contas e transações via provedor regulado. Não altera suas
            transações manuais nem importadas por CSV.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm" className="gap-2">
          <Plus size={15} />
          Nova conexão
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          message="Não foi possível carregar as conexões."
          onRetry={() => refetch()}
        />
      ) : connections?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Link2 size={40} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">Nenhuma conexão Open Finance</p>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            Conectar uma conta
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {connections?.map((c) => (
            <ConnectionCard
              key={c.id}
              connection={c}
              onDelete={() => setDeleting(c)}
            />
          ))}
        </div>
      )}

      <ConnectionModal open={creating} onClose={() => setCreating(false)} />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.connectorName ?? "Conexão"}</strong> e todas as
              contas e transações externas importadas serão removidas. Suas
              transações manuais e de CSV não são afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting)
                  deleteMutation.mutate(deleting.id, {
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

function ConnectionCard({
  connection,
  onDelete,
}: {
  connection: OpenFinanceConnection
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const sync = useSyncOpenFinanceConnection()
  const lastRun = connection.syncRuns[0]

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">
              {connection.connectorName ?? "Conexão"}
            </p>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                STATUS_TONE[connection.status]
              )}
            >
              {OF_CONNECTION_STATUS_LABELS[connection.status]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Provedor: {connection.provider}
            {connection.lastSyncedAt
              ? ` · última sync ${formatDateTime(connection.lastSyncedAt)}`
              : " · nunca sincronizada"}
          </p>
          {connection.statusDetail && (
            <p className="text-xs text-destructive">{connection.statusDetail}</p>
          )}
          {lastRun?.status === "ERROR" && lastRun.errorMessage && (
            <p className="text-xs text-destructive">
              Última sync falhou: {lastRun.errorMessage}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={sync.isPending}
            onClick={() => sync.mutate(connection.id)}
          >
            <RefreshCw
              size={14}
              className={cn(sync.isPending && "animate-spin")}
            />
            Sincronizar
          </Button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Remover conexão"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {connection.accounts.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {connection.accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border bg-background p-3"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-muted">
                <Building2 size={16} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {a.name ?? "Conta"} {a.number ? `· ${a.number}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {a.balance != null
                    ? formatCurrency(a.balance)
                    : "saldo indisponível"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="self-start text-xs font-medium text-primary hover:underline"
      >
        {open ? "Ocultar transações" : "Ver transações importadas"}
      </button>

      {open && <ConnectionTransactions id={connection.id} />}
    </div>
  )
}

function ConnectionTransactions({ id }: { id: string }) {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError } = useOpenFinanceTransactions(id, page)

  if (isLoading) return <Skeleton className="h-32 rounded-lg" />
  if (isError)
    return <p className="text-xs text-destructive">Erro ao carregar transações.</p>
  if (!data || data.data.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        Nenhuma transação importada ainda.
      </p>
    )

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit))

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Data</th>
              <th className="px-3 py-2 text-left font-medium">Descrição</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  {formatDate(t.date)}
                </td>
                <td className="px-3 py-2">
                  {t.description}
                  {t.category ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t.category}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {t.status ?? "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    t.direction === "INFLOW"
                      ? "text-emerald-600"
                      : "text-foreground"
                  )}
                >
                  {formatCurrency(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Página {page} de {totalPages} · {data.total} transações
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ConnectionModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const create = useCreateOpenFinanceConnection()
  const [itemId, setItemId] = useState("")
  const [connectorId, setConnectorId] = useState("")
  const [user, setUser] = useState("")
  const [password, setPassword] = useState("")

  const reset = () => {
    setItemId("")
    setConnectorId("")
    setUser("")
    setPassword("")
  }

  const onSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault()
    const parameters: Record<string, string> = {}
    if (user) parameters.user = user
    if (password) parameters.password = password
    create.mutate(
      {
        itemId: itemId || undefined,
        connectorId: connectorId || undefined,
        parameters: Object.keys(parameters).length ? parameters : undefined,
      },
      {
        onSuccess: () => {
          onClose()
          reset()
        },
      }
    )
  }

  return (
    <FormModal
      open={open}
      onClose={() => {
        onClose()
        reset()
      }}
      title="Nova conexão Open Finance"
      formId="of-connection-form"
      onSubmit={onSubmit}
      isPending={create.isPending}
    >
      <div className="flex flex-col gap-4 py-1">
        <p className="text-xs text-muted-foreground">
          Use o <strong>Item ID</strong> gerado pelo widget do provedor, ou deixe
          em branco e informe um conector de sandbox com credenciais de teste. As
          credenciais vão direto ao provedor e não são armazenadas.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label>Item ID (widget)</Label>
          <Input
            placeholder="ex: 1b2c3d4e-..."
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Connector ID (sandbox)</Label>
          <Input
            placeholder="ex: 2 (Pluggy Bank sandbox)"
            value={connectorId}
            onChange={(e) => setConnectorId(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Usuário (sandbox)</Label>
            <Input value={user} onChange={(e) => setUser(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Senha (sandbox)</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
      </div>
    </FormModal>
  )
}
