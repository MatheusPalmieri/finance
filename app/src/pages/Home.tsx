import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useClients } from "@/lib/queries"
import { CLIENT_STATUS_LABELS, type ClientStatus } from "@/types/client"

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  NEGOTIATING: "default",
  TRIAL: "default",
  CUSTOM_TRIAL: "default",
  MESSAGE_SENT: "outline",
}

export function Home() {
  const { data, isLoading } = useClients({ page: 1, limit: 5 })

  const total = data?.meta.total ?? 0

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Home</h1>
        <p className="text-sm text-muted-foreground">Visão geral do CRM</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5">
              <Skeleton className="mb-2 h-3.5 w-28" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Total de clientes" value={String(total)} />
            <StatCard label="Adicionados hoje" value="—" />
            <StatCard label="Trial ativo" value="—" />
            <StatCard label="Fechados este mês" value="—" />
          </>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recentes</h2>
        <div className="overflow-hidden rounded-lg border bg-card divide-y">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))
          ) : data?.data.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhum cliente cadastrado
            </div>
          ) : (
            data?.data.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.city}</p>
                </div>
                <Badge
                  variant={STATUS_BADGE_VARIANT[c.status] ?? "secondary"}
                  className="text-xs"
                >
                  {CLIENT_STATUS_LABELS[c.status as ClientStatus]}
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  )
}
