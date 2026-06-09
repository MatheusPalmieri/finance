import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CLIENT_PHASE_LABELS,
  CLOSE_REASON_LABELS,
  type Client,
  type ClientPhase,
  type CloseReason,
} from "@/types/client"
import { useClients, useClientCities } from "@/lib/queries"
import type {
  ContactedFilter,
  CreatedWithin,
  ResponsibleFilter,
} from "@/lib/api"
import { AlertTriangle, Plus, Search, SlidersHorizontal, X } from "lucide-react"
import { ClientsTable } from "./ClientsTable"
import { ClientDetailsModal } from "./ClientDetailsModal"
import { CreateClientModal } from "./CreateClientModal"
import { EditClientModal } from "./EditClientModal"
import { PhaseModal } from "./PhaseModal"
import { ResponsibleModal } from "./ResponsibleModal"
import { DeleteDialog } from "./DeleteDialog"

const PHASE_OPTIONS = Object.entries(CLIENT_PHASE_LABELS) as [
  ClientPhase,
  string,
][]
const CLOSE_REASON_OPTIONS = Object.entries(CLOSE_REASON_LABELS) as [
  CloseReason,
  string,
][]

const CREATED_WITHIN_OPTIONS: [CreatedWithin, string][] = [
  ["", "Qualquer data"],
  ["7d", "Últimos 7 dias"],
  ["30d", "Últimos 30 dias"],
  ["90d", "Últimos 90 dias"],
]

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
  const [closeReasonFilter, setCloseReasonFilter] = useState<CloseReason | "">(
    ""
  )
  const [cityFilter, setCityFilter] = useState("")
  const [contactedFilter, setContactedFilter] = useState<ContactedFilter>("all")
  const [responsibleFilter, setResponsibleFilter] =
    useState<ResponsibleFilter>("all")
  const [createdWithin, setCreatedWithin] = useState<CreatedWithin>("")
  const [showDuplicates, setShowDuplicates] = useState(false)

  const debouncedSearch = useDebounce(search, 350)

  const { data: cities } = useClientCities()

  const { data, isLoading, isFetching } = useClients({
    page,
    limit,
    search: debouncedSearch || undefined,
    phase: phaseFilter || undefined,
    closeReason: closeReasonFilter || undefined,
    city: cityFilter || undefined,
    contacted: contactedFilter,
    hasResponsible: responsibleFilter,
    createdWithin: createdWithin || undefined,
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
    setCloseReasonFilter("")
    setCityFilter("")
    setContactedFilter("all")
    setResponsibleFilter("all")
    setCreatedWithin("")
    setShowDuplicates(false)
    setPage(1)
  }

  const [createOpen, setCreateOpen] = useState(false)
  const [detailsClient, setDetailsClient] = useState<Client | null>(null)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [phaseClient, setPhaseClient] = useState<Client | null>(null)
  const [responsibleClient, setResponsibleClient] = useState<Client | null>(
    null
  )
  const [deleteClient, setDeleteClient] = useState<Client | null>(null)

  // Abre um dialog de ação a partir do modal de detalhes: fecha os detalhes
  // antes para não empilhar dois diálogos.
  function openFromDetails(
    open: (client: Client) => void,
    client: Client
  ) {
    setDetailsClient(null)
    open(client)
  }

  // Filtros "avançados" agrupados no popover — alimentam o badge de contagem
  const advancedCount =
    (closeReasonFilter ? 1 : 0) +
    (contactedFilter !== "all" ? 1 : 0) +
    (responsibleFilter !== "all" ? 1 : 0) +
    (createdWithin ? 1 : 0)

  const hasFilters =
    !!debouncedSearch ||
    !!phaseFilter ||
    !!cityFilter ||
    showDuplicates ||
    advancedCount > 0

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
        <div className="relative max-w-xs min-w-50 flex-1">
          <Search
            size={13}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="h-8 pr-8 pl-8 text-sm"
            placeholder="Buscar por nome ou cidade..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <Select
          value={phaseFilter || "all"}
          onValueChange={(v) =>
            handlePhaseChange(v === "all" ? "" : (v as ClientPhase))
          }
        >
          <SelectTrigger className="h-8 w-40 text-sm">
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

        <Select
          value={cityFilter || "all"}
          onValueChange={(v) => {
            setCityFilter(v === "all" ? "" : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue placeholder="Todas as cidades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as cidades</SelectItem>
            {(cities ?? []).map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <SlidersHorizontal size={13} />
              Filtros
              {advancedCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-0.5 h-4 min-w-4 px-1 tabular-nums"
                >
                  {advancedCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  Motivo de fechamento
                </Label>
                <Select
                  value={closeReasonFilter || "all"}
                  onValueChange={(v) => {
                    setCloseReasonFilter(v === "all" ? "" : (v as CloseReason))
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue placeholder="Todos os motivos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os motivos</SelectItem>
                    {CLOSE_REASON_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Contato</Label>
                <Select
                  value={contactedFilter}
                  onValueChange={(v) => {
                    setContactedFilter(v as ContactedFilter)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="yes">Contatados</SelectItem>
                    <SelectItem value="no">Não contatados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  Responsável
                </Label>
                <Select
                  value={responsibleFilter}
                  onValueChange={(v) => {
                    setResponsibleFilter(v as ResponsibleFilter)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="yes">Com responsável</SelectItem>
                    <SelectItem value="no">Sem responsável</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Criado em</Label>
                <Select
                  value={createdWithin || "any"}
                  onValueChange={(v) => {
                    setCreatedWithin(v === "any" ? "" : (v as CreatedWithin))
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CREATED_WITHIN_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value || "any"} value={value || "any"}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>

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
        isFetching={isFetching}
        onPageChange={setPage}
        onLimitChange={handleLimitChange}
        onRowClick={setDetailsClient}
        onEdit={setEditClient}
        onChangePhase={setPhaseClient}
        onChangeResponsible={setResponsibleClient}
        onDelete={setDeleteClient}
      />

      <ClientDetailsModal
        client={detailsClient}
        onClose={() => setDetailsClient(null)}
        onEdit={(c) => openFromDetails(setEditClient, c)}
        onChangePhase={(c) => openFromDetails(setPhaseClient, c)}
        onChangeResponsible={(c) => openFromDetails(setResponsibleClient, c)}
        onDelete={(c) => openFromDetails(setDeleteClient, c)}
      />

      <CreateClientModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <EditClientModal
        client={editClient}
        onClose={() => setEditClient(null)}
      />
      <PhaseModal client={phaseClient} onClose={() => setPhaseClient(null)} />
      <ResponsibleModal
        client={responsibleClient}
        onClose={() => setResponsibleClient(null)}
      />
      <DeleteDialog
        client={deleteClient}
        onClose={() => setDeleteClient(null)}
      />
    </div>
  )
}
