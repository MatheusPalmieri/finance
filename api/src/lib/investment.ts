// Projeção de prazo do investimento — calculada em tempo de leitura, nunca
// armazenada. Trabalha SOMENTE sobre valor bruto (sem rendimentos, juros ou
// correção monetária).

export interface InvestmentProjection {
  remainingAmount: number
  estimatedMonths: number | null
  estimatedLabel: string
  goalReached: boolean
}

// Converte meses em rótulo legível: "1 ano e 2 meses", "1 ano", "3 meses"
export function formatMonthsLabel(months: number): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  const parts: string[] = []
  if (years > 0) parts.push(years === 1 ? "1 ano" : `${years} anos`)
  if (rest > 0) parts.push(rest === 1 ? "1 mês" : `${rest} meses`)
  return parts.join(" e ") || "0 meses"
}

// Regras:
// - meta ou aporte mensal nulos → null
// - current >= meta → goal_reached: true ("Meta atingida ✅")
// - aporte mensal = 0 → não projeta ("Aporte mensal não definido")
// - válido → meses (CEIL do restante / aporte) + label
export function computeProjection(inv: {
  currentAmount: string
  goalAmount: string | null
  monthlyContribution: string | null
}): InvestmentProjection | null {
  if (inv.goalAmount == null || inv.monthlyContribution == null) return null

  const current = Number(inv.currentAmount)
  const goal = Number(inv.goalAmount)
  const monthly = Number(inv.monthlyContribution)
  const remaining = Math.max(0, goal - current)

  if (current >= goal) {
    return {
      remainingAmount: 0,
      estimatedMonths: 0,
      estimatedLabel: "Meta atingida ✅",
      goalReached: true,
    }
  }

  if (monthly <= 0) {
    return {
      remainingAmount: remaining,
      estimatedMonths: null,
      estimatedLabel: "Aporte mensal não definido",
      goalReached: false,
    }
  }

  const months = Math.ceil(remaining / monthly)
  return {
    remainingAmount: remaining,
    estimatedMonths: months,
    estimatedLabel: formatMonthsLabel(months),
    goalReached: false,
  }
}
