export type ClientStatus =
  | "NOT_STARTED"
  | "MESSAGE_SENT"
  | "NEGOTIATING"
  | "HAS_SYSTEM"
  | "NO_RESPONSE"
  | "REJECTED"
  | "DISLIKED"
  | "TRIAL"
  | "CUSTOM_TRIAL"
  | "INVALID_CONTACT"

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  NOT_STARTED: "Não iniciado",
  MESSAGE_SENT: "Mensagem enviada",
  NEGOTIATING: "Negociando",
  HAS_SYSTEM: "Tem sistema",
  NO_RESPONSE: "Sem resposta",
  REJECTED: "Rejeitado",
  DISLIKED: "Não gostou",
  TRIAL: "Trial",
  CUSTOM_TRIAL: "Trial customizado",
  INVALID_CONTACT: "Contato inválido",
}

export const CLIENT_STATUS_COLORS: Record<ClientStatus, string> = {
  NOT_STARTED: "secondary",
  MESSAGE_SENT: "default",
  NEGOTIATING: "default",
  HAS_SYSTEM: "destructive",
  NO_RESPONSE: "secondary",
  REJECTED: "destructive",
  DISLIKED: "destructive",
  TRIAL: "default",
  CUSTOM_TRIAL: "default",
  INVALID_CONTACT: "destructive",
}

export interface Client {
  id: string
  name: string
  phoneAreaCode: string
  phoneNumber: string
  responsiblePhoneAreaCode: string | null
  responsiblePhoneNumber: string | null
  city: string
  status: ClientStatus
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
