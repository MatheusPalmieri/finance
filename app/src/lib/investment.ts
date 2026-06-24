import type { InvestmentProjection } from "@/types/finance"

// Espelha api/src/lib/investment.ts para projeção em tempo real no formulário.
// Trabalha SOMENTE sobre valor bruto (sem rendimentos, juros ou correção).

// Converte meses em rótulo legível: "1 ano e 2 meses", "1 ano", "3 meses"
export function formatMonthsLabel(months: number): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  const parts: string[] = []
  if (years > 0) parts.push(years === 1 ? "1 ano" : `${years} anos`)
  if (rest > 0) parts.push(rest === 1 ? "1 mês" : `${rest} meses`)
  return parts.join(" e ") || "0 meses"
}

export function computeProjection(
  currentAmount: number,
  goalAmount: number | null | undefined,
  monthlyContribution: number | null | undefined
): InvestmentProjection | null {
  if (goalAmount == null || monthlyContribution == null) return null

  const remaining = Math.max(0, goalAmount - currentAmount)

  if (currentAmount >= goalAmount) {
    return {
      remainingAmount: 0,
      estimatedMonths: 0,
      estimatedLabel: "Meta atingida ✅",
      goalReached: true,
    }
  }

  if (monthlyContribution <= 0) {
    return {
      remainingAmount: remaining,
      estimatedMonths: null,
      estimatedLabel: "Aporte mensal não definido",
      goalReached: false,
    }
  }

  const months = Math.ceil(remaining / monthlyContribution)
  return {
    remainingAmount: remaining,
    estimatedMonths: months,
    estimatedLabel: formatMonthsLabel(months),
    goalReached: false,
  }
}
