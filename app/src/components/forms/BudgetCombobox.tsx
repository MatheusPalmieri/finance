import { useState } from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useBudgets } from "@/lib/queries"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { BUDGET_TYPE_HEX, type Budget } from "@/types/finance"

// Texto do valor do orçamento (fixo ou faixa)
function budgetValueLabel(b: Budget) {
  if (b.amountType === "fixed") return formatCurrency(b.amount ?? 0)
  return `${formatCurrency(b.amountMin ?? 0)} – ${formatCurrency(b.amountMax ?? 0)}`
}

// Select com busca (autocomplete) que consulta GET /budgets?name=...
export function BudgetCombobox({
  value,
  onChange,
  selectedName,
  hasError,
}: {
  value: string | null | undefined
  onChange: (id: string) => void
  selectedName?: string
  hasError?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [label, setLabel] = useState(selectedName ?? "")

  // Busca no servidor por nome (debounce natural do React Query por chave)
  const { data: budgets, isLoading } = useBudgets(search || undefined)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-invalid={hasError}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
            !value && "text-muted-foreground"
          )}
        >
          <span className="truncate">{value ? label || "Orçamento selecionado" : "Selecione o orçamento"}</span>
          <ChevronsUpDown size={14} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search size={14} className="shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar orçamento..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {isLoading ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Carregando...</p>
          ) : !budgets?.length ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum orçamento encontrado</p>
          ) : (
            budgets.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  onChange(b.id)
                  setLabel(b.name)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: BUDGET_TYPE_HEX[b.type] }} />
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{budgetValueLabel(b)}</span>
                {value === b.id && <Check size={14} className="shrink-0 text-primary" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
