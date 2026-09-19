// O laço de simulação e os percentis. Função pura: recebe dados, devolve dados.
// Sem `db`, sem `fetch` — é o que torna este módulo barato de testar.

import { mulberry32, sample, triangular } from "./random"
import type {
  MonthPlan,
  Percentiles,
  ProjectedMonth,
  ProjectionSummary,
  SimulationInput,
} from "./types"

/** Iterações do Monte Carlo. Em Bun, ~30ms para 6 meses × 15 categorias. */
export const SIMULATION_RUNS = 5000

/**
 * Percentil por interpolação linear sobre a amostra ordenada.
 * `sorted` precisa estar em ordem crescente.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function percentilesOf(values: number[]): Percentiles {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p10: round2(percentile(sorted, 0.1)),
    p25: round2(percentile(sorted, 0.25)),
    p50: round2(percentile(sorted, 0.5)),
    p75: round2(percentile(sorted, 0.75)),
    p90: round2(percentile(sorted, 0.9)),
  }
}

function round2(value: number): number {
  return Number(value.toFixed(2))
}

/**
 * Fator de tendência aplicado ao mês `index` (0 = primeiro do horizonte).
 * Limitado a ±20% no horizonte inteiro: extrapolar tendência sem teto é o erro
 * clássico deste tipo de modelo.
 */
export function trendFactor(
  trendMonthlyPct: number | null,
  monthIndex: number
): number {
  if (trendMonthlyPct === null) return 1
  const raw = trendMonthlyPct * (monthIndex + 1)
  const clamped = Math.max(-0.2, Math.min(0.2, raw))
  return 1 + clamped
}

/** Despesa variável determinística de um mês (usada quando não há sorteio). */
function meanOf(series: number[]): number {
  if (series.length === 0) return 0
  return series.reduce((sum, v) => sum + v, 0) / series.length
}

export interface SimulationOutput {
  months: ProjectedMonth[]
  summary: ProjectionSummary
}

/**
 * Monte Carlo do saldo acumulado.
 *
 * Em cada iteração e mês:
 * `saldo += receita − fixos − faixas − variáveis − conhecidas − cenário`
 *
 * Os componentes estocásticos (faixas e variáveis) são escalados por
 * `remainingFraction`, que vale 1 em meses futuros e a fração restante no mês
 * corrente — o que já foi gasto este mês já está no saldo das contas.
 */
export function simulate(input: SimulationInput): SimulationOutput {
  const { months, categories, openingBalance } = input
  const runs = Math.max(1, input.runs)
  const rand = mulberry32(input.seed)

  // balancesByMonth[i][run] — saldo acumulado ao fim do mês i naquela iteração
  const balancesByMonth: number[][] = months.map(() => new Array<number>(runs))
  const variableByMonth: number[][] = months.map(() => new Array<number>(runs))
  let anyNegative = 0

  for (let run = 0; run < runs; run++) {
    let balance = openingBalance
    let wentNegative = false

    for (let i = 0; i < months.length; i++) {
      const plan = months[i]

      let ranges = 0
      for (const budget of plan.rangeBudgets) {
        ranges += triangular(budget.min, budget.mode, budget.max, rand)
      }

      let variable = 0
      for (const category of categories) {
        // Categoria com histórico curto não é sorteada: vira constante.
        const draw = category.lowConfidence
          ? meanOf(category.series)
          : sample(category.series, rand)
        variable += draw * trendFactor(category.trendMonthlyPct, i)
      }

      const scaled = (ranges + variable) * plan.remainingFraction
      balance +=
        plan.expectedIncome -
        plan.fixedExpenses -
        scaled -
        plan.knownTransactions -
        plan.scenarioImpact

      balancesByMonth[i][run] = balance
      variableByMonth[i][run] = variable * plan.remainingFraction
      if (balance < 0) wentNegative = true
    }

    if (wentNegative) anyNegative++
  }

  const projected: ProjectedMonth[] = months.map((plan, i) => {
    const balances = balancesByMonth[i]
    const negatives = balances.reduce((count, b) => count + (b < 0 ? 1 : 0), 0)
    const variableSorted = [...variableByMonth[i]].sort((a, b) => a - b)

    return {
      month: plan.month,
      year: plan.year,
      label: plan.label,
      expectedIncome: round2(plan.expectedIncome),
      fixedExpenses: round2(
        plan.fixedExpenses +
          plan.rangeBudgets.reduce((sum, b) => sum + b.mode, 0) *
            plan.remainingFraction
      ),
      variableExpensesP50: round2(percentile(variableSorted, 0.5)),
      knownTransactions: round2(plan.knownTransactions),
      scenarioImpact: round2(plan.scenarioImpact),
      balance: percentilesOf(balances),
      probNegative: round4(negatives / runs),
    }
  })

  const worst = projected.reduce(
    (lowest, month) => (month.balance.p10 < lowest.balance.p10 ? month : lowest),
    projected[0]
  )

  return {
    months: projected,
    summary: {
      endBalanceP50: projected[projected.length - 1]?.balance.p50 ?? openingBalance,
      worstMonthLabel: worst?.label ?? "",
      minBalanceP10: worst?.balance.p10 ?? openingBalance,
      probAnyNegative: round4(anyNegative / runs),
    },
  }
}

function round4(value: number): number {
  return Number(value.toFixed(4))
}

/** Rótulo curto do mês: "out/26". */
export function monthLabel(month: number, year: number): string {
  const names = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ]
  return `${names[month - 1]}/${String(year).slice(2)}`
}

/** Chave "YYYY-MM" de um mês do horizonte. */
export function monthKey(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}`
}

/** Constrói a lista de meses do horizonte a partir do mês corrente. */
export function horizonMonths(
  startMonth: number,
  startYear: number,
  count: number
): { month: number; year: number; label: string; key: string }[] {
  const out = []
  for (let i = 0; i < count; i++) {
    const zeroBased = startYear * 12 + (startMonth - 1) + i
    const year = Math.floor(zeroBased / 12)
    const month = (zeroBased % 12) + 1
    out.push({
      month,
      year,
      label: monthLabel(month, year),
      key: monthKey(month, year),
    })
  }
  return out
}

export type { MonthPlan }
