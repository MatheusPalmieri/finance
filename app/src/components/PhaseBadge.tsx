import { Badge } from "@/components/ui/badge"
import {
  CLIENT_PHASE_LABELS,
  CLOSE_REASON_LABELS,
  type Client,
  type ClientPhase,
  type CloseReason,
} from "@/types/client"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

const PHASE_VARIANT: Record<ClientPhase, BadgeVariant> = {
  PROSPECTING: "secondary",
  NEGOTIATING: "default",
  CLOSED: "secondary",
}

const CLOSE_REASON_VARIANT: Record<CloseReason, BadgeVariant> = {
  CLIENT: "default",
  TRIAL: "outline",
  CUSTOM_TRIAL: "outline",
  PRICE_OBJECTION: "destructive",
  NO_FIT: "destructive",
  GHOST: "secondary",
  UNREACHABLE: "secondary",
}

// Badge de status do cliente: mostra o motivo de fechamento quando o cliente
// está fechado (closeReason), senão a fase atual.
export function PhaseBadge({
  client,
  className,
}: {
  client: Pick<Client, "phase" | "closeReason">
  className?: string
}) {
  const variant = client.closeReason
    ? CLOSE_REASON_VARIANT[client.closeReason]
    : PHASE_VARIANT[client.phase]
  const label = client.closeReason
    ? CLOSE_REASON_LABELS[client.closeReason]
    : CLIENT_PHASE_LABELS[client.phase]

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  )
}
