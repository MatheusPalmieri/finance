// Tipos da projeção de fluxo de caixa.
//
// Convenção deste módulo: despesa e receita são **magnitudes positivas**, e o
// que muda é onde entram na conta. É diferente da convenção de sinal de
// `transactions` (positivo = despesa) — a conversão acontece em `history.ts` e
// `service.ts`, nunca aqui dentro.

export interface CategorySeries {
  categoryId: string
  categoryName: string
  /** Total mensal dos últimos 12 meses; meses sem gasto entram como 0. */
  series: number[]
  /** Menos de 3 meses de histórico: entra como constante e é sinalizada. */
  lowConfidence: boolean
  /** Variação mensal (fração) quando há tendência estatisticamente aceitável. */
  trendMonthlyPct: number | null
}

/** Orçamento de faixa: amostrado por distribuição triangular. */
export interface RangeBudget {
  budgetId: string
  name: string
  min: number
  mode: number
  max: number
}

/** O que é conhecido e determinístico em cada mês do horizonte. */
export interface MonthPlan {
  month: number
  year: number
  label: string
  /** Receita recorrente esperada (magnitude positiva). */
  expectedIncome: number
  /** Orçamentos de valor fixo (magnitude positiva). */
  fixedExpenses: number
  /** Orçamentos de faixa, amostrados a cada iteração. */
  rangeBudgets: RangeBudget[]
  /** Transações já cadastradas com data futura. Positivo = saída líquida. */
  knownTransactions: number
  /** Eventos do cenário simulado. Positivo = saída líquida. */
  scenarioImpact: number
  /**
   * Fração do mês ainda por acontecer (1 em meses futuros). No mês corrente,
   * o que já foi gasto está no saldo das contas — projetar o mês inteiro
   * contaria duas vezes.
   */
  remainingFraction: number
}

export interface SimulationInput {
  openingBalance: number
  months: MonthPlan[]
  categories: CategorySeries[]
  runs: number
  seed: number
}

export interface Percentiles {
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export interface ProjectedMonth {
  month: number
  year: number
  label: string
  expectedIncome: number
  fixedExpenses: number
  variableExpensesP50: number
  knownTransactions: number
  scenarioImpact: number
  balance: Percentiles
  /** Fração das iterações em que o saldo deste mês fechou negativo. */
  probNegative: number
}

export interface ProjectionSummary {
  endBalanceP50: number
  worstMonthLabel: string
  minBalanceP10: number
  /** Probabilidade de o saldo ficar negativo em ALGUM mês do horizonte. */
  probAnyNegative: number
}

/**
 * Transparência obrigatória do modelo. Não é enfeite: é o que permite ao
 * usuário saber que a projeção de uma base com 2 meses de dados não vale nada.
 */
export interface ProjectionAssumptions {
  historyMonths: number
  lowConfidenceCategories: string[]
  categoriesWithTrend: { categoryName: string; monthlyPct: number }[]
  simulationRuns: number
  seed: number
  /** Reserva mínima usada pelo veredito, e se veio do usuário ou do default. */
  minimumReserveBrl: number
  minimumReserveIsDefault: boolean
  /**
   * Receita recorrente detectada. Quando a lista vem vazia, a projeção só
   * enxerga saídas e o saldo despenca — a UI precisa dizer isso, senão o
   * usuário lê um gráfico assustador sem entender que falta informação.
   */
  recurringIncome: {
    monthlyTotal: number
    sources: { label: string; monthlyAmount: number; occurrences: number }[]
  }
}

/** "live" = saldo da Pluggy; "stored" = `accounts.balance` (sem Open Finance ou fora do ar). */
export type OpeningBalanceSource = "live" | "stored"

export interface CashflowProjection {
  openingBalance: number
  openingAccounts: { id: string; name: string; balance: number }[]
  openingBalanceSource: OpeningBalanceSource
  months: ProjectedMonth[]
  summary: ProjectionSummary
  assumptions: ProjectionAssumptions
}

// ── Cenários ─────────────────────────────────────────────────────────────────

export type ScenarioEvent =
  | {
      kind: "installment_purchase"
      label: string
      totalAmount: number
      /** 1 = à vista. */
      installments: number
      monthlyInterestPct?: number
      /** "2026-11"; default próximo mês. */
      startMonth?: string
      categoryId?: string | null
    }
  | {
      kind: "recurring_change"
      label: string
      /** Positivo = novo gasto; negativo = corte. */
      monthlyAmount: number
      startMonth?: string
      endMonth?: string
      categoryId?: string | null
    }
  | {
      kind: "one_off"
      label: string
      /** Positivo = gasto; negativo = entrada. */
      amount: number
      month: string
    }
  | {
      kind: "income_change"
      label: string
      /** Delta na receita mensal. */
      monthlyAmount: number
      startMonth?: string
    }

export type Verdict = "safe" | "tight" | "risky" | "no"

export interface AffordabilityVerdict {
  verdict: Verdict
  probAnyNegative: number
  minBalanceP10: number
  minimumReserveBrl: number
  /** Explicação determinística, montada em pt-BR sem IA. */
  reason: string
}

export interface AffordabilityActions {
  /** Teto para este parcelamento antes de o veredito deixar de ser aceitável. */
  maxAffordableTotal: number | null
  /** Menor número de parcelas que mantém `safe`. */
  saferInstallments: number | null
  /** Mês de início, dentro do horizonte, com o melhor p10. */
  bestStartMonth: string | null
}
