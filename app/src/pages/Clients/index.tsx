import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CLIENT_PHASE_LABELS,
  type Client,
  type ClientPhase,
} from "@/types/client"
import { useClients } from "@/lib/queries"
import { AlertTriangle, Plus, Search, X } from "lucide-react"
import { ClientsTable } from "./ClientsTable"
import { CreateClientModal } from "./CreateClientModal"
import { EditClientModal } from "./EditClientModal"
import { PhaseModal } from "./PhaseModal"
import { ResponsibleModal } from "./ResponsibleModal"
import { DeleteDialog } from "./DeleteDialog"

const PHASE_OPTIONS = Object.entries(CLIENT_PHASE_LABELS) as [ClientPhase, string][]

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function Clients() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState("")
  const [phaseFilter, setPhaseFilter] = useState<ClientPhase | "">("")
  const [showDuplicates, setShowDuplicates] = useState(false)

  const debouncedSearch = useDebounce(search, 350)

  const { data, isLoading } = useClients({
    page,
    limit,
    search: debouncedSearch || undefined,
    phase: phaseFilter || undefined,
    duplicates: showDuplicates,
  })

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  function handlePhaseChange(value: ClientPhase | "") {
    setPhaseFilter(value)
    setPage(1)
  }

  function handleDuplicatesToggle() {
    setShowDuplicates((v) => !v)
    setPage(1)
  }

  function handleLimitChange(value: number) {
    setLimit(value)
    setPage(1)
  }

  function handleClearFilters() {
    setSearch("")
    setPhaseFilter("")
    setShowDuplicates(false)
    setPage(1)
  }

  const [createOpen, setCreateOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [phaseClient, setPhaseClient] = useState<Client | null>(null)
  const [responsibleClient, setResponsibleClient] = useState<Client | null>(null)
  const [deleteClient, setDeleteClient] = useState<Client | null>(null)

  const hasFilters = !!debouncedSearch || !!phaseFilter || showDuplicates

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie sua base de clientes
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1.5" />
          Novo cliente
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-50 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 pr-8 text-sm"
            placeholder="Buscar por nome ou cidade..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <Select
          value={phaseFilter || "all"}
          onValueChange={(v) => handlePhaseChange(v === "all" ? "" : (v as ClientPhase))}
        >
          <SelectTrigger className="h-8 w-45 text-sm">
            <SelectValue placeholder="Todas as fases" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as fases</SelectItem>
            {PHASE_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={showDuplicates ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5"
          onClick={handleDuplicatesToggle}
        >
          <AlertTriangle size={13} />
          Duplicatas
        </Button>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={handleClearFilters}
          >
            <X size={13} className="mr-1" />
            Limpar
          </Button>
        )}
      </div>

      <ClientsTable
        clients={data?.data ?? []}
        total={data?.meta.total ?? 0}
        page={page}
        limit={limit}
        isLoading={isLoading}
        onPageChange={setPage}
        onLimitChange={handleLimitChange}
        onEdit={setEditClient}
        onChangePhase={setPhaseClient}
        onChangeResponsible={setResponsibleClient}
        onDelete={setDeleteClient}
      />

      <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditClientModal client={editClient} onClose={() => setEditClient(null)} />
      <PhaseModal client={phaseClient} onClose={() => setPhaseClient(null)} />
      <ResponsibleModal
        client={responsibleClient}
        onClose={() => setResponsibleClient(null)}
      />
      <DeleteDialog client={deleteClient} onClose={() => setDeleteClient(null)} />
    </div>
  )
}
