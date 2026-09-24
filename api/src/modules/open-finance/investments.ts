// Investimentos do Open Finance. A fonte é a Pluggy; o banco guarda o último
// retrato (`open_finance_snapshots`, prazo de 1h) e as telas leem de lá — cada
// busca são ~30 chamadas (a lista e as movimentações de cada ativo de renda
// variável), então não dá para fazer a cada abertura de tela. Ver snapshots.ts.
//
// O que é calculado aqui (e não vem pronto):
// - Renda fixa: lucro = saldo líquido (já sem IR) − valor aplicado.
// - Renda variável: preço médio e custo pelo método do custo médio sobre as
//   movimentações BUY/SELL — a Pluggy não manda o valor aplicado.
// - Proventos: soma das movimentações INTEREST nos últimos 12 meses.
// - Liquidez diária: renda fixa sem carência (`gracePeriodDate` passada ou
//   ausente). É o dinheiro que a projeção trata como caixa.

import { getProvider, isConfigured } from "./provider"
import { getSnapshot, type SnapshotMeta } from "./snapshots"
import type { ProviderInvestment, ProviderInvestmentTransaction } from "./types"

export type InvestmentClass =
  | "Renda fixa"
  | "FIIs"
  | "Ações"
  | "BDRs"
  | "ETFs"
  | "Fundos"
  | "Previdência"
  | "Outros"

export interface InvestmentPosition {
  id: string
  name: string
  code: string | null
  type: string | null
  subtype: string | null
  assetClass: InvestmentClass
  /** Valor atual líquido (renda fixa: já sem IR). */
  balance: number
  /** Valor aplicado (renda fixa) ou custo remanescente (renda variável). */
  invested: number | null
  profit: number | null
  profitPct: number | null
  quantity: number | null
  price: number | null
  averagePrice: number | null
  /** Renda fixa: IR retido no resgate. */
  taxes: number | null
  rate: number | null
  rateType: string | null
  dueDate: string | null
  issuer: string | null
  liquid: boolean
  incomeLast12m: number
}

interface InvestmentsData {
  total: number
  invested: number
  profit: number
  /** Renda fixa com liquidez diária — entra como caixa na projeção. */
  liquid: number
  byClass: { assetClass: InvestmentClass; total: number; pct: number; count: number }[]
  positions: InvestmentPosition[]
  income: { last12m: number; byMonth: { month: string; total: number }[] }
}

export type Investments = SnapshotMeta & InvestmentsData

function round2(value: number): number {
  return Number(value.toFixed(2))
}

export function classify(inv: Pick<ProviderInvestment, "type" | "subtype">): InvestmentClass {
  switch (inv.type) {
    case "FIXED_INCOME":
      return "Renda fixa"
    case "ETF":
      return "ETFs"
    case "MUTUAL_FUND":
      return "Fundos"
    case "SECURITY":
      return "Previdência"
    case "EQUITY":
      if (inv.subtype === "REAL_ESTATE_FUND") return "FIIs"
      if (inv.subtype === "BDR") return "BDRs"
      if (inv.subtype === "ETF") return "ETFs"
      return "Ações"
    default:
      return "Outros"
  }
}

/**
 * Custo médio: compra soma quantidade e custo; venda baixa a quantidade e o
 * custo proporcional ao preço médio do momento. Movimentações sem quantidade
 * (proventos, direitos de subscrição) não mexem no custo.
 */
export function averageCost(txs: ProviderInvestmentTransaction[]): {
  quantity: number
  cost: number
  averagePrice: number | null
} {
  let quantity = 0
  let cost = 0
  const ordered = [...txs].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
  for (const tx of ordered) {
    const q = Number(tx.quantity ?? 0)
    if (!q) continue
    if (tx.type === "BUY") {
      quantity += q
      cost += Number(tx.amount ?? q * Number(tx.value ?? 0))
    } else if (tx.type === "SELL" && quantity > 0) {
      const sold = Math.min(q, quantity)
      cost -= (cost / quantity) * sold
      quantity -= sold
    }
  }
  return { quantity, cost: round2(cost), averagePrice: quantity > 0 ? cost / quantity : null }
}

export function isLiquid(inv: ProviderInvestment, today = new Date().toISOString().slice(0, 10)): boolean {
  if (inv.type !== "FIXED_INCOME") return false
  const grace = inv.gracePeriodDate?.slice(0, 10)
  return !grace || grace <= today
}

export function buildPosition(
  inv: ProviderInvestment,
  txs: ProviderInvestmentTransaction[],
  since12m: string
): InvestmentPosition {
  const assetClass = classify(inv)
  const balance = round2(Number(inv.balance ?? 0))
  const isFixed = inv.type === "FIXED_INCOME"

  let invested: number | null = null
  let averagePrice: number | null = null
  if (isFixed) {
    invested = inv.amountOriginal == null ? null : round2(Number(inv.amountOriginal))
  } else {
    const basis = averageCost(txs)
    if (basis.quantity > 0) {
      invested = basis.cost
      averagePrice = basis.averagePrice == null ? null : round2(basis.averagePrice)
    }
  }
  const profit = invested == null ? null : round2(balance - invested)

  return {
    id: inv.id,
    name: inv.name ?? inv.code ?? "Investimento",
    code: inv.code ?? null,
    type: inv.type ?? null,
    subtype: inv.subtype ?? null,
    assetClass,
    balance,
    invested,
    profit,
    profitPct: invested && profit != null ? round2((profit / invested) * 100) : null,
    quantity: inv.quantity ?? null,
    price: isFixed ? null : (inv.value ?? null),
    averagePrice,
    taxes: isFixed ? round2(Number(inv.taxes ?? 0) + Number(inv.taxes2 ?? 0)) : null,
    rate: inv.rate ?? null,
    rateType: inv.rateType ?? null,
    dueDate: inv.dueDate?.slice(0, 10) ?? null,
    issuer: inv.issuer ?? null,
    liquid: isLiquid(inv),
    incomeLast12m: round2(
      txs
        .filter((t) => t.type === "INTEREST" && (t.date ?? "").slice(0, 10) >= since12m)
        .reduce((sum, t) => sum + Number(t.amount ?? 0), 0)
    ),
  }
}

const EMPTY: InvestmentsData = {
  total: 0,
  invested: 0,
  profit: 0,
  liquid: 0,
  byClass: [],
  positions: [],
  income: { last12m: 0, byMonth: [] },
}

async function fetchInvestments(): Promise<InvestmentsData> {
  if (!isConfigured()) throw new Error("Open Finance não configurado")
  const provider = await getProvider()
  const all = (await Promise.all(provider.itemIds().map((id) => provider.listInvestments(id)))).flat()
  // Posições encerradas (a maioria: cada aplicação RDB vira um CDB) ficam de fora
  const active = all.filter((inv) => Number(inv.balance ?? 0) > 0)

  // Movimentações: só renda variável precisa (custo médio e proventos)
  const txsById = new Map<string, ProviderInvestmentTransaction[]>()
  await Promise.all(
    active
      .filter((inv) => inv.type !== "FIXED_INCOME")
      .map(async (inv) => txsById.set(inv.id, await provider.listInvestmentTransactions(inv.id)))
  )

  const since = new Date()
  since.setMonth(since.getMonth() - 12)
  const since12m = since.toISOString().slice(0, 10)

  const positions = active
    .map((inv) => buildPosition(inv, txsById.get(inv.id) ?? [], since12m))
    .sort((a, b) => b.balance - a.balance)

  const total = round2(positions.reduce((s, p) => s + p.balance, 0))
  const withBasis = positions.filter((p) => p.invested != null)
  const invested = round2(withBasis.reduce((s, p) => s + p.invested!, 0))
  const profit = round2(withBasis.reduce((s, p) => s + p.profit!, 0))

  const classes = new Map<InvestmentClass, { total: number; count: number }>()
  for (const p of positions) {
    const entry = classes.get(p.assetClass) ?? { total: 0, count: 0 }
    entry.total += p.balance
    entry.count++
    classes.set(p.assetClass, entry)
  }

  const incomeByMonth = new Map<string, number>()
  for (const txs of txsById.values()) {
    for (const t of txs) {
      const date = (t.date ?? "").slice(0, 10)
      if (t.type !== "INTEREST" || date < since12m) continue
      incomeByMonth.set(date.slice(0, 7), (incomeByMonth.get(date.slice(0, 7)) ?? 0) + Number(t.amount ?? 0))
    }
  }

  return {
    total,
    invested,
    profit,
    liquid: round2(positions.filter((p) => p.liquid).reduce((s, p) => s + p.balance, 0)),
    byClass: [...classes]
      .map(([assetClass, e]) => ({
        assetClass,
        total: round2(e.total),
        pct: total > 0 ? round2((e.total / total) * 100) : 0,
        count: e.count,
      }))
      .sort((a, b) => b.total - a.total),
    positions,
    income: {
      last12m: round2([...incomeByMonth.values()].reduce((s, v) => s + v, 0)),
      byMonth: [...incomeByMonth]
        .map(([month, value]) => ({ month, total: round2(value) }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    },
  }
}

/** Investimentos: do banco quando recentes (1h), da Pluggy quando vencidos ou `fresh`. */
export async function getInvestments(options: { fresh?: boolean } = {}): Promise<Investments> {
  const { data, meta } = await getSnapshot("investments", fetchInvestments, options)
  return { ...meta, ...(data ?? EMPTY) }
}
