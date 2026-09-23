// Camada 2 — vizinhos mais próximos sobre o histórico já classificado.
// Sem embedding e sem extensão nova no Postgres: similaridade de trigramas
// (coeficiente de Dice) num índice em memória.
//
// Se a base passar de ~50 mil transações, trocar por `pg_trgm` é uma mudança
// interna deste arquivo — a interface não muda.

import { and, desc, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { transactions, type PaymentMethod, type Recurrence } from "../../db/schema"
import { diceSimilarity, merchantKey, trigrams } from "./normalize"
import { REAL_TRANSACTIONS } from "../../lib/scope"
import { EMPTY_PATCH, type ClassificationPatch } from "./types"

/** Aplica só a partir deste limiar. Exportado para o teste. */
export const KNN_THRESHOLD = 0.75
/** Quantos vizinhos votam. */
export const KNN_K = 5
/** Quantas transações entram no índice. */
export const KNN_SAMPLE_SIZE = 1000
/** Abaixo disso, a carteira não tem histórico suficiente e usa o global. */

export interface KnnEntry {
  key: string
  grams: Set<string>
  name: string
  categoryId: string
  paymentMethod: PaymentMethod
  recurrence: Recurrence
  isEssential: boolean
}

export type KnnIndex = KnnEntry[]

export function buildKnnIndex(
  rows: {
    name: string
    categoryId: string
    paymentMethod: PaymentMethod
    recurrence: Recurrence
    isEssential: boolean
  }[]
): KnnIndex {
  const index: KnnIndex = []
  for (const row of rows) {
    const key = merchantKey(row.name)
    if (!key) continue
    index.push({ ...row, key, grams: trigrams(key) })
  }
  return index
}

/** Moda de uma lista, com desempate pela primeira ocorrência. */
function mode<T>(values: T[]): T | null {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: T | null = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

export interface KnnSuggestion {
  patch: ClassificationPatch
  confidence: number
}

/**
 * Os `KNN_K` vizinhos mais próximos votam ponderado pela similaridade; vence a
 * categoria com mais peso. A confiança é a similaridade **média** dos vizinhos
 * que votaram na vencedora — não a do melhor vizinho isolado.
 *
 * Função pura: recebe o índice pronto.
 */
export function knnSuggest(
  index: KnnIndex,
  description: string
): KnnSuggestion | null {
  const key = merchantKey(description)
  if (!key || index.length === 0) return null

  const grams = trigrams(key)
  const scored = index
    .map((entry) => ({ entry, sim: diceSimilarity(grams, entry.grams) }))
    .filter((n) => n.sim > 0)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, KNN_K)

  if (scored.length === 0) return null

  const weightByCategory = new Map<string, number>()
  for (const { entry, sim } of scored) {
    weightByCategory.set(
      entry.categoryId,
      (weightByCategory.get(entry.categoryId) ?? 0) + sim
    )
  }

  let winner = ""
  let bestWeight = 0
  for (const [categoryId, weight] of weightByCategory) {
    if (weight > bestWeight) {
      winner = categoryId
      bestWeight = weight
    }
  }

  const supporters = scored.filter((n) => n.entry.categoryId === winner)
  const confidence =
    supporters.reduce((sum, n) => sum + n.sim, 0) / supporters.length

  if (confidence < KNN_THRESHOLD) return null

  return {
    confidence,
    patch: {
      ...EMPTY_PATCH,
      categoryId: winner,
      // O nome do vizinho mais parecido só é reaproveitado quando a chave é a
      // mesma — caso contrário ficaria "Netflix" numa linha da Spotify.
      suggestedName:
        supporters[0].entry.key === key ? supporters[0].entry.name : null,
      paymentMethod: mode(supporters.map((n) => n.entry.paymentMethod)),
      recurrence: mode(supporters.map((n) => n.entry.recurrence)),
      isEssential: mode(supporters.map((n) => n.entry.isEssential)),
    },
  }
}

/** Índice das últimas transações classificadas (sem as de contas sandbox). */
export async function loadKnnIndex(): Promise<KnnIndex> {
  const rows = await db
    .select({
      name: transactions.name,
      categoryId: transactions.categoryId,
      paymentMethod: transactions.paymentMethod,
      recurrence: transactions.recurrence,
      isEssential: transactions.isEssential,
    })
    .from(transactions)
    .where(and(isNotNull(transactions.categoryId), REAL_TRANSACTIONS))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(KNN_SAMPLE_SIZE)

  return buildKnnIndex(rows)
}

/** Contagem usada pelo `/classification/rules/test` e pela UI de diagnóstico. */
export async function historySize(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(transactions)
  return row?.total ?? 0
}
