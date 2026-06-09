import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, type ListClientsParams, type StatsParams } from "./api"
import type { ClientPhase, CloseReason } from "@/types/client"

export const clientKeys = {
  all: ["clients"] as const,
  lists: () => [...clientKeys.all, "list"] as const,
  list: (params: ListClientsParams) => [...clientKeys.lists(), params] as const,
  detail: (id: string) => [...clientKeys.all, "detail", id] as const,
  stats: (params: StatsParams) => [...clientKeys.all, "stats", params] as const,
}

export function useClients(params: ListClientsParams) {
  return useQuery({
    queryKey: clientKeys.list(params),
    queryFn: () => api.clients.list(params),
  })
}

export function useClientStats(params: StatsParams) {
  return useQuery({
    queryKey: clientKeys.stats(params),
    queryFn: () => api.clients.stats(params),
  })
}

export function useCreateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.clients.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.lists() })
      toast.success("Cliente criado com sucesso")
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "Erro ao criar cliente")
    },
  })
}

export function useUpdateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; phoneAreaCode: string; phoneNumber: string; city: string }) =>
      api.clients.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.lists() })
      toast.success("Cliente atualizado")
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "Erro ao atualizar cliente")
    },
  })
}

export function useUpdateClientPhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      phase,
      closeReason,
      messageSent,
    }: {
      id: string
      phase: ClientPhase
      closeReason?: CloseReason
      messageSent?: boolean
    }) => api.clients.updatePhase(id, { phase, closeReason, messageSent }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.lists() })
      toast.success("Fase atualizada")
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "Erro ao atualizar fase")
    },
  })
}

export function useUpdateClientResponsible() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      responsiblePhoneAreaCode,
      responsiblePhoneNumber,
    }: {
      id: string
      responsiblePhoneAreaCode: string
      responsiblePhoneNumber: string
    }) => api.clients.updateResponsible(id, { responsiblePhoneAreaCode, responsiblePhoneNumber }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.lists() })
      toast.success("Responsável atualizado")
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "Erro ao atualizar responsável")
    },
  })
}

export function useDeleteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.clients.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.lists() })
      toast.success("Cliente excluído")
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "Erro ao excluir cliente")
    },
  })
}
