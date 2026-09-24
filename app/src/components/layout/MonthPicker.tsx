import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import { usePeriod } from "@/components/period-provider"
import { MONTHS } from "@/types/finance"

const btn =
  "flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-40"

// Seletor global de mês. `compact` (sidebar recolhida) empilha as setas
// verticalmente e mostra só a abreviação do mês.
export function MonthPicker({ compact = false }: { compact?: boolean }) {
  const { month, year, isCurrentMonth, prevMonth, nextMonth } = usePeriod()

  if (compact) {
    return (
      <div
        className="flex flex-col items-center gap-0.5 rounded-lg border border-sidebar-border py-1"
        title={`${MONTHS[month - 1]} ${year}`}
      >
        <button
          type="button"
          onClick={nextMonth}
          disabled={isCurrentMonth}
          aria-label="Próximo mês"
          className={`${btn} size-7`}
        >
          <ChevronUp size={14} />
        </button>
        <span className="text-[10px] leading-tight font-semibold uppercase">
          {MONTHS[month - 1].slice(0, 3)}
        </span>
        <span className="text-[9px] leading-none text-muted-foreground">
          {String(year).slice(2)}
        </span>
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Mês anterior"
          className={`${btn} size-7`}
        >
          <ChevronDown size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-sidebar-border px-1 py-1">
      <button
        type="button"
        onClick={prevMonth}
        aria-label="Mês anterior"
        className={`${btn} size-9 lg:size-7`}
      >
        <ChevronLeft size={14} />
      </button>
      <span className="flex-1 text-center text-sm font-medium">
        {MONTHS[month - 1]} {year}
      </span>
      <button
        type="button"
        onClick={nextMonth}
        disabled={isCurrentMonth}
        aria-label="Próximo mês"
        className={`${btn} size-9 lg:size-7`}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
