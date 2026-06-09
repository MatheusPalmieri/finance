import type { ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CloseReasonBadge, PhaseBadge } from "@/components/PhaseBadge"
import {
  AlertTriangle,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  UserCheck,
} from "lucide-react"
import { formatDateTime, formatPhone, relativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Client } from "@/types/client"

interface ClientDetailsModalProps {
  client: Client | null
  onClose: () => void
  onEdit: (client: Client) => void
  onChangePhase: (client: Client) => void
  onChangeResponsible: (client: Client) => void
  onDelete: (client: Client) => void
}

// Linha rótulo + valor dentro de uma seção
function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right text-sm",
          mono && "font-mono text-muted-foreground"
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="divide-y divide-border/60 rounded-lg border bg-muted/30 px-3">
        {children}
      </div>
    </div>
  )
}

const EMPTY = <span className="text-muted-foreground/50">—</span>

export function ClientDetailsModal({
  client,
  onClose,
  onEdit,
  onChangePhase,
  onChangeResponsible,
  onDelete,
}: ClientDetailsModalProps) {
  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {client && (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3 pr-12">
                <div className="min-w-0">
                  <DialogTitle className="truncate text-lg">
                    {client.name}
                  </DialogTitle>
                  <DialogDescription className="mt-1 flex items-center gap-1.5">
                    <MapPin size={12} className="shrink-0" />
                    {client.city}
                  </DialogDescription>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {client.hasDuplicate && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-500">
                      <AlertTriangle size={11} />
                      Duplicado
                    </span>
                  )}
                  <PhaseBadge client={client} phaseOnly className="text-xs" />
                  {client.closeReason && (
                    <CloseReasonBadge
                      closeReason={client.closeReason}
                      className="text-xs"
                    />
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-5">
              <Section title="Contato">
                <Field
                  label="Telefone"
                  mono
                  value={formatPhone(client.phoneAreaCode, client.phoneNumber)}
                />
                <Field
                  label="Responsável"
                  mono
                  value={
                    client.responsiblePhoneAreaCode &&
                    client.responsiblePhoneNumber
                      ? formatPhone(
                          client.responsiblePhoneAreaCode,
                          client.responsiblePhoneNumber
                        )
                      : EMPTY
                  }
                />
              </Section>

              <div>
                <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Linha do tempo
                </h3>
                <ol className="space-y-0 rounded-lg border bg-muted/30 px-4 py-3">
                  {(
                    [
                      ["Mensagem enviada", client.messageSentAt],
                      ["Negociação iniciada", client.negotiatingStartedAt],
                      ["Fechado", client.closedAt],
                    ] as const
                  ).map(([label, at], i, arr) => (
                    <li key={label} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "mt-1 size-2.5 shrink-0 rounded-full ring-2 ring-background",
                            at ? "bg-emerald-500" : "bg-muted-foreground/25"
                          )}
                        />
                        {i < arr.length - 1 && (
                          <span className="my-0.5 w-px flex-1 bg-border" />
                        )}
                      </div>
                      <div className="pb-4 last:pb-0">
                        <p
                          className={cn(
                            "text-sm leading-none",
                            !at && "text-muted-foreground"
                          )}
                        >
                          {label}
                        </p>
                        <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
                          {at ? (
                            <>
                              {formatDateTime(at)}{" "}
                              <span className="text-muted-foreground/60">
                                · {relativeTime(at)}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/50">
                              Pendente
                            </span>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <Section title="Registro">
                <Field
                  label="Criado em"
                  value={`${formatDateTime(client.createdAt)} · ${relativeTime(client.createdAt)}`}
                />
                <Field
                  label="Atualizado em"
                  value={`${formatDateTime(client.updatedAt)} · ${relativeTime(client.updatedAt)}`}
                />
                <Field
                  label="ID"
                  mono
                  value={<span className="text-xs">{client.id}</span>}
                />
              </Section>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive sm:mr-auto"
                onClick={() => onDelete(client)}
              >
                <Trash2 size={13} className="mr-1.5" />
                Excluir
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onChangeResponsible(client)}
                >
                  <Phone size={13} className="mr-1.5" />
                  Responsável
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onChangePhase(client)}
                >
                  <UserCheck size={13} className="mr-1.5" />
                  Fase/motivo
                </Button>
                <Button size="sm" onClick={() => onEdit(client)}>
                  <Pencil size={13} className="mr-1.5" />
                  Editar
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
