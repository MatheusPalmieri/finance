// Cache persistente do Open Finance: o último retrato de saldos e investimentos
// fica em `open_finance_snapshots` e é servido de lá.
//
// Por que no banco e não só em memória:
// - Estabilidade: com a Pluggy fora do ar (ou sem rede), o app continua
//   mostrando o último dado real, marcado como desatualizado — em vez de uma
//   tela vazia.
// - Performance: abrir o app lê uma linha do Postgres; a Pluggy só é chamada
//   quando o retrato passou do prazo (ver `TTL_MS`).
// - Menos requisições: o sync já traz as contas com saldo e grava o retrato no
//   mesmo passo — sem chamada extra.
//
// Nunca há dado inventado: sem retrato e sem Pluggy, a resposta é `source:
// "none"` e a UI diz "indisponível".

import { eq } from "drizzle-orm"
import { db } from "../../db"
import { openFinanceSnapshots, type SnapshotKind } from "../../db/schema"
import { log } from "./log"

/** Idade máxima de um retrato antes de buscar na Pluggy de novo. */
export const TTL_MS: Record<SnapshotKind, number> = {
  balances: 15 * 60_000,
  // Posições mudam devagar e são ~30 chamadas por leitura
  investments: 60 * 60_000,
}

/** De onde veio o dado entregue. */
export type SnapshotSource = "live" | "cache" | "none"

export interface SnapshotMeta {
  /** `false` só quando não há retrato nenhum e a Pluggy falhou. */
  available: boolean
  source: SnapshotSource
  /** Passou do prazo e a Pluggy não respondeu: é o último dado conhecido. */
  stale: boolean
  /** Motivo da falha da última tentativa, quando houve. */
  error: string | null
  /** Quando a Pluggy devolveu o dado (ISO). */
  fetchedAt: string | null
}

export async function readSnapshot<T>(kind: SnapshotKind): Promise<{ payload: T; fetchedAt: Date } | null> {
  const [row] = await db
    .select()
    .from(openFinanceSnapshots)
    .where(eq(openFinanceSnapshots.kind, kind))
    .limit(1)
  return row ? { payload: row.payload as T, fetchedAt: row.fetchedAt } : null
}

export async function writeSnapshot(kind: SnapshotKind, payload: unknown, fetchedAt = new Date()) {
  await db
    .insert(openFinanceSnapshots)
    .values({ kind, payload, fetchedAt })
    .onConflictDoUpdate({ target: openFinanceSnapshots.kind, set: { payload, fetchedAt } })
}

const inFlight = new Map<SnapshotKind, Promise<unknown>>()

/**
 * Lê um retrato com o fluxo cache → Pluggy → último conhecido:
 *
 * 1. Retrato dentro do prazo (e sem `fresh`): devolve do banco.
 * 2. Senão, busca na Pluggy (uma busca por vez por tipo — várias telas pedindo
 *    juntas compartilham a mesma chamada), grava e devolve.
 * 3. Se a Pluggy falhar, devolve o retrato antigo com `stale: true`; sem
 *    retrato, `available: false`.
 */
export async function getSnapshot<T>(
  kind: SnapshotKind,
  fetchLive: () => Promise<T>,
  options: { fresh?: boolean } = {}
): Promise<{ data: T | null; meta: SnapshotMeta }> {
  const stored = await readSnapshot<T>(kind)
  const age = stored ? Date.now() - stored.fetchedAt.getTime() : Infinity
  if (stored && !options.fresh && age < TTL_MS[kind]) {
    return { data: stored.payload, meta: meta("cache", stored.fetchedAt, false, null) }
  }

  let pending = inFlight.get(kind) as Promise<{ data: T; fetchedAt: Date }> | undefined
  if (!pending) {
    // A gravação faz parte da busca: chamadas simultâneas gravam uma vez só
    pending = fetchLive().then(async (data) => {
      const fetchedAt = new Date()
      await writeSnapshot(kind, data, fetchedAt)
      return { data, fetchedAt }
    })
    inFlight.set(kind, pending)
    pending.finally(() => inFlight.delete(kind)).catch(() => {})
  }

  try {
    const { data, fetchedAt } = await pending
    return { data, meta: meta("live", fetchedAt, false, null) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Só a mensagem: nunca o payload, que tem valores financeiros
    log.error(`${kind}: Pluggy indisponível`, { message, fallback: stored ? "cache" : "none" })
    if (stored) return { data: stored.payload, meta: meta("cache", stored.fetchedAt, true, message) }
    return {
      data: null,
      meta: { available: false, source: "none", stale: false, error: message, fetchedAt: null },
    }
  }
}

function meta(source: SnapshotSource, fetchedAt: Date, stale: boolean, error: string | null): SnapshotMeta {
  return { available: true, source, stale, error, fetchedAt: fetchedAt.toISOString() }
}

/** Só para testes. */
export function __clearSnapshotInFlight() {
  inFlight.clear()
}
