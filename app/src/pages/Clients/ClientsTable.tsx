import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertTriangle,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Phone,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react"
import { memo } from "react"
import { type Client } from "@/types/client"
import { CloseReasonBadge, PhaseBadge } from "@/components/PhaseBadge"
import { formatPhone } from "@/lib/format"
import { cn } from "@/lib/utils"

const LIMIT_OPTIONS = [10, 25, 50, 100]

interface ClientsTableProps {
  clients: Client[]
  total: number
  page: number
  limit: number
  isLoading: boolean
  isFetching?: boolean
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
  onRowClick: (client: Client) => void
  onEdit: (client: Client) => void
  onChangePhase: (client: Client) => void
  onChangeResponsible: (client: Client) => void
  onDelete: (client: Client) => void
}

interface ClientRowProps {
  client: Client
  onRowClick: (client: Client) => void
  onEdit: (client: Client) => void
  onChangePhase: (client: Client) => void
  onChangeResponsible: (client: Client) => void
  onDelete: (client: Client) => void
}

// Linha memoizada: como os handlers vêm de setState (referência estável) e o
// objeto client só muda quando os dados mudam, mexer no estado do pai (abrir
// modal, paginar) não re-renderiza todas as linhas.
const ClientRow = memo(function ClientRow({
  client,
  onRowClick,
  onEdit,
  onChangePhase,
  onChangeResponsible,
  onDelete,
}: ClientRowProps) {
  return (
    <TableRow
      role="button"
      tabIndex={0}
      onClick={() => onRowClick(client)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onRowClick(client)
        }
      }}
      className="cursor-pointer"
    >
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {client.hasDuplicate && (
            <AlertTriangle
              size={13}
              className="shrink-0 text-amber-500"
              aria-label="Telefone duplicado"
            />
          )}
          <span className="max-w-45 truncate">{client.name}</span>
        </div>
      </TableCell>

      <TableCell className="font-mono text-sm text-muted-foreground">
        {formatPhone(client.phoneAreaCode, client.phoneNumber)}
      </TableCell>

      <TableCell className="text-muted-foreground">{client.city}</TableCell>

      <TableCell>
        <PhaseBadge client={client} phaseOnly className="text-xs" />
      </TableCell>

      <TableCell>
        {client.closeReason ? (
          <CloseReasonBadge closeReason={client.closeReason} className="text-xs" />
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </TableCell>

      <TableCell className="font-mono text-sm text-muted-foreground">
        {client.responsiblePhoneAreaCode && client.responsiblePhoneNumber ? (
          formatPhone(
            client.responsiblePhoneAreaCode,
            client.responsiblePhoneNumber
          )
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </TableCell>

      <TableCell onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal size={14} />
              <span className="sr-only">Ações</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => onEdit(client)}>
              <Pencil size={13} className="mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChangePhase(client)}>
              <UserCheck size={13} className="mr-2" />
              Alterar fase/motivo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChangeResponsible(client)}>
              <Phone size={13} className="mr-2" />
              Responsável
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(client)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 size={13} className="mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
})

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-36" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-7 w-7 rounded-md" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

export function ClientsTable({
  clients,
  total,
  page,
  limit,
  isLoading,
  isFetching,
  onPageChange,
  onLimitChange,
  onRowClick,
  onEdit,
  onChangePhase,
  onChangeResponsible,
  onDelete,
}: ClientsTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-card transition-opacity",
          // Atenua durante refetch em background (troca de página/filtro),
          // sem voltar ao skeleton.
          isFetching && !isLoading && "opacity-60"
        )}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-medium">Nome</TableHead>
              <TableHead className="font-medium">Telefone</TableHead>
              <TableHead className="font-medium">Cidade</TableHead>
              <TableHead className="font-medium">Fase</TableHead>
              <TableHead className="font-medium">Motivo</TableHead>
              <TableHead className="font-medium">Responsável</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Users size={32} strokeWidth={1.5} />
                    <div>
                      <p className="text-sm font-medium">
                        Nenhum cliente encontrado
                      </p>
                      <p className="text-xs">
                        Tente ajustar os filtros ou adicione um novo cliente
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  onRowClick={onRowClick}
                  onEdit={onEdit}
                  onChangePhase={onChangePhase}
                  onChangeResponsible={onChangeResponsible}
                  onDelete={onDelete}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-4 px-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          {isLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <span className="tabular-nums">
              {from}–{to} de {total}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs">por página</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => onLimitChange(Number(v))}
            >
              <SelectTrigger className="h-7 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(1)}
            title="Primeira página"
          >
            <ChevronsLeft size={13} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(page - 1)}
            title="Página anterior"
          >
            <ChevronLeft size={13} />
          </Button>

          <span className="min-w-20 text-center text-xs tabular-nums">
            {isLoading ? "..." : `${page} / ${totalPages}`}
          </span>

          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages || isLoading}
            onClick={() => onPageChange(page + 1)}
            title="Próxima página"
          >
            <ChevronRight size={13} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages || isLoading}
            onClick={() => onPageChange(totalPages)}
            title="Última página"
          >
            <ChevronsRight size={13} />
          </Button>
        </div>
      </div>
    </div>
  )
}
