import type {
  Client,
  ClientPhase,
  ClientsResponse,
  CloseReason,
} from "@/types/client"

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export type ContactedFilter = "all" | "yes" | "no"
export type ResponsibleFilter = "all" | "yes" | "no"
export type CreatedWithin = "" | "7d" | "30d" | "90d"

export interface ListClientsParams {
  page?: number
  limit?: number
  search?: string
  phase?: ClientPhase | ""
  closeReason?: CloseReason | ""
  city?: string
  contacted?: ContactedFilter
  hasResponsible?: ResponsibleFilter
  createdWithin?: CreatedWithin
  duplicates?: boolean
}

export type StatsPeriod = "7d" | "30d" | "90d" | "all"

export interface StatsParams {
  period?: StatsPeriod
  city?: string
}

export interface ClientStats {
  total: number
  phaseCounts: Record<ClientPhase, number>
  closeReasonCounts: Partial<Record<CloseReason, number>>
  contacted: number
  byCity: { city: string; count: number }[]
  timeline: { date: string; count: number }[]
  cities: string[]
}

export const api = {
  clients: {
    list: (params: ListClientsParams = {}) => {
      const q = new URLSearchParams()
      if (params.page) q.set("page", String(params.page))
      if (params.limit) q.set("limit", String(params.limit))
      if (params.search) q.set("search", params.search)
      if (params.phase) q.set("phase", params.phase)
      if (params.closeReason) q.set("closeReason", params.closeReason)
      if (params.city) q.set("city", params.city)
      if (params.contacted && params.contacted !== "all")
        q.set("contacted", params.contacted === "yes" ? "true" : "false")
      if (params.hasResponsible && params.hasResponsible !== "all")
        q.set(
          "hasResponsible",
          params.hasResponsible === "yes" ? "true" : "false"
        )
      if (params.createdWithin) q.set("createdWithin", params.createdWithin)
      if (params.duplicates) q.set("duplicates", "true")
      return request<ClientsResponse>(`/clients?${q}`)
    },

    get: (id: string) => request<Client>(`/clients/${id}`),

    cities: () => request<string[]>("/clients/cities"),

    stats: (params: StatsParams = {}) => {
      const q = new URLSearchParams()
      if (params.period) q.set("period", params.period)
      if (params.city) q.set("city", params.city)
      return request<ClientStats>(`/clients/stats?${q}`)
    },

    create: (body: {
      name: string
      phoneAreaCode: string
      phoneNumber: string
      city: string
      phase?: ClientPhase
      closeReason?: CloseReason
      messageSent?: boolean
    }) =>
      request<Client>("/clients", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    update: (
      id: string,
      body: {
        name: string
        phoneAreaCode: string
        phoneNumber: string
        city: string
      }
    ) =>
      request<Client>(`/clients/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),

    updatePhase: (
      id: string,
      body: {
        phase: ClientPhase
        closeReason?: CloseReason
        messageSent?: boolean
      }
    ) =>
      request<Client>(`/clients/${id}/phase`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    updateResponsible: (
      id: string,
      body: {
        responsiblePhoneAreaCode: string
        responsiblePhoneNumber: string
      }
    ) =>
      request<Client>(`/clients/${id}/responsible`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    delete: (id: string) =>
      request<{ success: boolean }>(`/clients/${id}`, { method: "DELETE" }),
  },
}
