// Seção 7 — insights tipados, produzidos ANTES do LLM. É isto que a UI
// renderiza como cards e o que a narrativa recebe como material.
// Função pura: recebe as métricas, devolve a lista. Coberta por insights.test.ts.

import type {
  Insight,
  InsightSeverity,
  MonthlyReportMetrics,
} from "./types"

/** Desvio a partir do qual a distribuição 50/30/20 vira notícia. */
export const DISTRIBUTION_TOLERANCE_PP = 5
/** Quantos insights o relatório guarda. */
export const MAX_INSIGHTS = 12

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
}

const TYPE_LABELS = {
  essential: "essenciais",
  desire: "variáveis",
  investment: "investimentos",
} as const

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function buildInsights(metrics: MonthlyReportMetrics): Insight[] {
  // Mês sem nenhum movimento não rende insight: sem despesa não há orçamento
  // "esquecido", e uma distribuição 50/30/20 de zero não diz nada. A UI mostra
  // o estado vazio (ver .claude/docs/frontend/states.md).
  if (
    metrics.totals.transactionCount.current === 0 &&
    metrics.totals.totalIncome.current === 0
  ) {
    return []
  }

  const insights: Insight[] = []

  // ── Resultado do mês ───────────────────────────────────────────────────────
  if (metrics.totals.netResult.current < 0) {
    const gap = Math.abs(metrics.totals.netResult.current)
    insights.push({
      kind: "negative_month",
      severity: "critical",
      title: `Você gastou ${brl(gap)} a mais do que recebeu`,
      amountBrl: gap,
      facts: {
        netResult: metrics.totals.netResult.current,
        totalExpenses: metrics.totals.totalExpenses.current,
        totalIncome: metrics.totals.totalIncome.current,
      },
    })
  }

  // ── Orçamentos ─────────────────────────────────────────────────────────────
  for (const line of metrics.budgets) {
    if (line.status === "over") {
      const ceiling = line.plannedBrl ?? line.plannedMaxBrl ?? 0
      const excess = line.actualBrl - ceiling
      insights.push({
        kind: "budget_over",
        severity: "warn",
        title: `${line.name} estourou em ${brl(excess)}`,
        amountBrl: excess,
        budgetId: line.budgetId,
        facts: {
          budgetName: line.name,
          planned: ceiling,
          actual: line.actualBrl,
          excess,
        },
      })
    }
    if (line.status === "missing") {
      insights.push({
        kind: "budget_missing",
        severity: "warn",
        title: `${line.name} não teve nenhum lançamento no mês`,
        amountBrl: line.plannedBrl ?? line.plannedMinBrl,
        budgetId: line.budgetId,
        facts: {
          budgetName: line.name,
          planned: line.plannedBrl ?? line.plannedMinBrl ?? 0,
        },
      })
    }
  }

  // ── Anomalias por categoria ────────────────────────────────────────────────
  for (const anomaly of metrics.anomalies) {
    const diff = anomaly.currentBrl - anomaly.medianBrl
    if (anomaly.severity === "saving") {
      insights.push({
        kind: "category_saving",
        severity: "info",
        title: `${anomaly.categoryName} caiu ${brl(Math.abs(diff))} abaixo do normal`,
        amountBrl: Math.abs(diff),
        categoryId: anomaly.categoryId,
        facts: {
          categoryName: anomaly.categoryName,
          current: anomaly.currentBrl,
          median: anomaly.medianBrl,
          robustZ: anomaly.robustZ,
        },
      })
      continue
    }
    insights.push({
      kind: "category_spike",
      severity: anomaly.severity === "high" ? "critical" : "warn",
      title: `${anomaly.categoryName} subiu ${brl(diff)} acima do normal`,
      amountBrl: diff,
      categoryId: anomaly.categoryId,
      facts: {
        categoryName: anomaly.categoryName,
        current: anomaly.currentBrl,
        median: anomaly.medianBrl,
        robustZ: anomaly.robustZ,
      },
    })
  }

  // ── Regra 50/30/20 ─────────────────────────────────────────────────────────
  for (const [type, bucket] of Object.entries(metrics.distribution)) {
    if (Math.abs(bucket.deltaPp) <= DISTRIBUTION_TOLERANCE_PP) continue
    const label = TYPE_LABELS[type as keyof typeof TYPE_LABELS]
    const direction = bucket.deltaPp > 0 ? "acima" : "abaixo"
    insights.push({
      kind: "rule_503020_off",
      severity: "info",
      title: `${bucket.pct}% em ${label} — ${Math.abs(bucket.deltaPp)} pontos ${direction} da meta de ${bucket.targetPct}%`,
      amountBrl: bucket.amountBrl,
      facts: {
        type,
        pct: bucket.pct,
        targetPct: bucket.targetPct,
        deltaPp: bucket.deltaPp,
        amount: bucket.amountBrl,
      },
    })
  }

  // ── Assinaturas ────────────────────────────────────────────────────────────
  if (metrics.subscriptions) {
    for (const serie of metrics.subscriptions.newThisMonth) {
      insights.push({
        kind: "subscription_new",
        severity: "info",
        title: `Nova cobrança recorrente: ${serie.label} (${brl(serie.monthlyCostBrl)}/mês)`,
        amountBrl: serie.monthlyCostBrl,
        recurringSeriesId: serie.id,
        facts: { label: serie.label, monthlyCost: serie.monthlyCostBrl },
      })
    }
    for (const serie of metrics.subscriptions.priceIncreases) {
      insights.push({
        kind: "subscription_price_up",
        severity: "warn",
        title: `${serie.label} aumentou ${serie.priceChangePct}%`,
        amountBrl: serie.monthlyCostBrl,
        recurringSeriesId: serie.id,
        facts: {
          label: serie.label,
          priceChangePct: serie.priceChangePct,
          monthlyCost: serie.monthlyCostBrl,
        },
      })
    }
  }

  // ── Mês recorde ────────────────────────────────────────────────────────────
  const historyTotals = metrics.anomalies
    .flatMap((a) => a.history.map((h) => h.month))
    .filter((month, i, all) => all.indexOf(month) === i)
  if (
    historyTotals.length >= 3 &&
    metrics.totals.totalExpenses.deltaPct !== null &&
    Math.abs(metrics.totals.totalExpenses.deltaPct) >= 20
  ) {
    const up = metrics.totals.totalExpenses.deltaPct > 0
    insights.push({
      kind: "record_month",
      severity: "info",
      title: up
        ? `Gasto total ${metrics.totals.totalExpenses.deltaPct}% maior que o mês passado`
        : `Gasto total ${Math.abs(metrics.totals.totalExpenses.deltaPct)}% menor que o mês passado`,
      amountBrl: metrics.totals.totalExpenses.current,
      facts: {
        current: metrics.totals.totalExpenses.current,
        previous: metrics.totals.totalExpenses.previous,
        deltaPct: metrics.totals.totalExpenses.deltaPct,
      },
    })
  }

  return insights
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        (b.amountBrl ?? 0) - (a.amountBrl ?? 0)
    )
    .slice(0, MAX_INSIGHTS)
}
