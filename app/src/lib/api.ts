import type { Client, ClientsResponse, ClientStatus } from "@/types/client"

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

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

export interface ListClientsParams {
  page?: number
  limit?: number
  search?: string
  status?: ClientStatus | ""
  duplicates?: boolean
}

export const api = {
  clients: {
    list: (params: ListClientsParams = {}) => {
      const q = new URLSearchParams()
      if (params.page) q.set("page", String(params.page))
      if (params.limit) q.set("limit", String(params.limit))
      if (params.search) q.set("search", params.search)
      if (params.status) q.set("status", params.status)
      if (params.duplicates) q.set("duplicates", "true")
      return request<ClientsResponse>(`/clients?${q}`)
    },

    get: (id: string) => request<Client>(`/clients/${id}`),

    create: (body: {
      name: string
      phoneAreaCode: string
      phoneNumber: string
      city: string
      status?: ClientStatus
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

    updateStatus: (id: string, status: ClientStatus) =>
      request<Client>(`/clients/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
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
