// Funções puras de normalização e planejamento de sincronização.
// Sem I/O — cobertas por testes unitários (normalize.test.ts).

import type { ProviderTransaction } from "./types"
import type { OfTxDirection } from "../../db/schema"

export interface NormalizedTransaction {
  providerTransactionId: string
  description: string
  /** String para o numeric do Drizzle. Sinal do projeto: + = saída, − = entrada. */
  amount: string
  direction: OfTxDirection
  currencyCode: string
  /** Sempre YYYY-MM-DD. */
  date: string
  status: string | null
  category: string | null
  rawPayload: unknown
}

/** Reduz uma data ISO (dia ou datetime) para YYYY-MM-DD. Lança se inválida. */
export function normalizeDate(input: string): string {
  const head = input.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head
  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Data inválida na transação externa: ${input}`)
  }
  return parsed.toISOString().slice(0, 10)
}

/**
 * Converte a convenção do provedor (negativo = saída) para a do projeto
 * (positivo = despesa que reduz saldo; negativo = entrada). A transação NÃO
 * é inserida em `transactions` — apenas guardada com origem, tipo, status e
 * identificador externo preservados.
 */
export function normalizeTransaction(
  tx: ProviderTransaction
): NormalizedTransaction {
  const providerAmount = Number(tx.amount)
  if (!Number.isFinite(providerAmount)) {
    throw new Error(
      `Valor inválido na transação ${tx.providerTransactionId}: ${String(tx.amount)}`
    )
  }
  const projectAmount = -providerAmount
  return {
    providerTransactionId: tx.providerTransactionId,
    description: (tx.description ?? "").trim() || "Sem descrição",
    amount: projectAmount.toFixed(2),
    direction: providerAmount <= 0 ? "OUTFLOW" : "INFLOW",
    currencyCode: (tx.currencyCode ?? "BRL").toUpperCase().slice(0, 3),
    date: normalizeDate(tx.date),
    status: tx.status ?? null,
    category: tx.category ?? null,
    rawPayload: tx.raw,
  }
}

export interface SyncPlan {
  toInsert: NormalizedTransaction[]
  toUpdate: NormalizedTransaction[]
}

/**
 * Idempotência: decide insert vs update pelo identificador do provedor.
 * Duplicatas dentro do próprio lote são colapsadas (a última ocorrência vence).
 */
export function planSync(
  incoming: ProviderTransaction[],
  existingIds: ReadonlySet<string>
): SyncPlan {
  const byId = new Map<string, NormalizedTransaction>()
  for (const tx of incoming) {
    byId.set(tx.providerTransactionId, normalizeTransaction(tx))
  }

  const toInsert: NormalizedTransaction[] = []
  const toUpdate: NormalizedTransaction[] = []
  for (const normalized of byId.values()) {
    if (existingIds.has(normalized.providerTransactionId)) {
      toUpdate.push(normalized)
    } else {
      toInsert.push(normalized)
    }
  }
  return { toInsert, toUpdate }
}
