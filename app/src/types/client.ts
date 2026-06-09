export type ClientPhase = "PROSPECTING" | "NEGOTIATING" | "CLOSED"

export type CloseReason =
  | "CLIENT"
  | "TRIAL"
  | "CUSTOM_TRIAL"
  | "PRICE_OBJECTION"
  | "NO_FIT"
  | "GHOST"
  | "UNREACHABLE"

export const CLIENT_PHASE_LABELS: Record<ClientPhase, string> = {
  PROSPECTING: "Prospecção",
  NEGOTIATING: "Negociando",
  CLOSED: "Fechado",
}

export const CLOSE_REASON_LABELS: Record<CloseReason, string> = {
  CLIENT: "Cliente",
  TRIAL: "Trial",
  CUSTOM_TRIAL: "Trial customizado",
  PRICE_OBJECTION: "Objeção de preço",
  NO_FIT: "Sem fit",
  GHOST: "Ghost",
  UNREACHABLE: "Inacessível",
}

// Cores de gráfico — fonte única para o dashboard do funil
export const CLIENT_PHASE_HEX: Record<ClientPhase, string> = {
  PROSPECTING: "#64748b", // slate
  NEGOTIATING: "#f59e0b", // amber
  CLOSED: "#94a3b8", // slate-400 (split por closeReason no gráfico)
}

export const CLOSE_REASON_HEX: Record<CloseReason, string> = {
  CLIENT: "#10b981", // emerald
  TRIAL: "#8b5cf6", // violet
  CUSTOM_TRIAL: "#a855f7", // purple
  PRICE_OBJECTION: "#f43f5e", // rose
  NO_FIT: "#ef4444", // red
  GHOST: "#a1a1aa", // zinc
  UNREACHABLE: "#78716c", // stone
}

export interface Client {
  id: string
  name: string
  phoneAreaCode: string
  phoneNumber: string
  responsiblePhoneAreaCode: string | null
  responsiblePhoneNumber: string | null
  city: string
  phase: ClientPhase
  closeReason: CloseReason | null
  messageSentAt: string | null
  negotiatingStartedAt: string | null
  closedAt: string | null
  hasDuplicate?: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ClientsResponse {
  data: Client[]
  meta: {
    total: number
    page: number
    limit: number
  }
}
