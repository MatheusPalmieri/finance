/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

interface PeriodContextValue {
  month: number
  year: number
  isCurrentMonth: boolean
  prevMonth: () => void
  nextMonth: () => void
}

const PeriodContext = createContext<PeriodContextValue | null>(null)

// Mês/ano selecionados — filtro global compartilhado por todas as páginas
export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriod] = useState(() => {
    const now = new Date()
    return { month: now.getMonth() + 1, year: now.getFullYear() }
  })

  const prevMonth = useCallback(() => {
    setPeriod(({ month, year }) =>
      month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
    )
  }, [])

  const nextMonth = useCallback(() => {
    setPeriod(({ month, year }) =>
      month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year }
    )
  }, [])

  const value = useMemo<PeriodContextValue>(() => {
    const now = new Date()
    return {
      ...period,
      isCurrentMonth:
        period.month === now.getMonth() + 1 &&
        period.year === now.getFullYear(),
      prevMonth,
      nextMonth,
    }
  }, [period, prevMonth, nextMonth])

  return (
    <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
  )
}

export function usePeriod() {
  const ctx = useContext(PeriodContext)
  if (!ctx) throw new Error("usePeriod deve ser usado dentro de PeriodProvider")
  return ctx
}
