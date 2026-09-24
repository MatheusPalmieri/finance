// Status, histórico e gatilhos do sync — o que as rotas e o script expõem.

import { desc, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import {
  accounts,
  pluggyAccounts,
  pluggyItems,
  pluggyTransactions,
  syncRuns,
  transactions,
} from "../../db/schema"
import { scheduleRecalculate } from "../classification"
import { log } from "./log"
import { isConfigured } from "./provider"
import { isSyncRunning, runSync, type SyncOptions } from "./sync"

/** Dados mais velhos que isso disparam um sync em segundo plano ao abrir o app. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000

/**
 * Dispara um sync sem esperar. O resultado fica em `sync_runs`; a UI acompanha
 * pelo `/open-finance/status`. Erros são logados, nunca propagados.
 */
export function startSync(opts: SyncOptions): void {
  runSync(opts).catch((err) =>
    log.error("sync em segundo plano falhou", {
      trigger: opts.trigger,
      message: err instanceof Error ? err.message : String(err),
    })
  )
}

export async function getStatus(options: { triggerIfStale?: boolean } = {}) {
  const configured = isConfigured()
  const items = await db.select().from(pluggyItems).orderBy(pluggyItems.createdAt)
  const links = await db
    .select({
      id: pluggyAccounts.id,
      providerAccountId: pluggyAccounts.providerAccountId,
      type: pluggyAccounts.type,
      subtype: pluggyAccounts.subtype,
      name: pluggyAccounts.name,
      number: pluggyAccounts.number,
      accountId: pluggyAccounts.accountId,
      accountName: accounts.name,
    })
    .from(pluggyAccounts)
    .innerJoin(accounts, eq(pluggyAccounts.accountId, accounts.id))
    .orderBy(pluggyAccounts.type)
  const [lastRun] = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1)

  const lastSyncedAt = items.reduce<Date | null>(
    (latest, item) =>
      item.lastSyncedAt && (!latest || item.lastSyncedAt > latest) ? item.lastSyncedAt : latest,
    null
  )
  const stale = configured && (!lastSyncedAt || Date.now() - lastSyncedAt.getTime() > STALE_AFTER_MS)

  let running = isSyncRunning()
  let startedBackgroundSync = false
  if (options.triggerIfStale && stale && !running) {
    startSync({ trigger: "stale" })
    running = true
    startedBackgroundSync = true
  }

  return {
    configured,
    running,
    stale,
    startedBackgroundSync,
    lastSyncedAt,
    items: items.map((item) => ({
      itemId: item.itemId,
      connectorName: item.connectorName,
      status: item.status,
      executionStatus: item.executionStatus,
      providerUpdatedAt: item.providerUpdatedAt,
      lastSyncedAt: item.lastSyncedAt,
      lastFullSyncAt: item.lastFullSyncAt,
    })),
    accounts: links,
    lastRun: lastRun ?? null,
  }
}

export function listRuns(limit = 20) {
  return db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(Math.min(100, Math.max(1, limit)))
}

/**
 * Troca a conta interna de uma conta do provedor. As transações que o sync já
 * trouxe dela vão junto.
 */
export async function relinkAccount(pluggyAccountId: string, accountId: string) {
  const [target] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1)
  if (!target) return { message: "Conta de destino não encontrada" } as const

  const [link] = await db
    .select()
    .from(pluggyAccounts)
    .where(eq(pluggyAccounts.id, pluggyAccountId))
    .limit(1)
  if (!link) return null

  const moved = await db.transaction(async (tx) => {
    await tx.update(pluggyAccounts).set({ accountId }).where(eq(pluggyAccounts.id, link.id))
    const linkedTx = await tx
      .select({ transactionId: pluggyTransactions.transactionId })
      .from(pluggyTransactions)
      .where(eq(pluggyTransactions.pluggyAccountId, link.id))
    const ids = linkedTx.map((row) => row.transactionId).filter((id): id is string => !!id)
    if (ids.length === 0) return 0
    const updated = await tx
      .update(transactions)
      .set({ accountId })
      .where(inArray(transactions.id, ids))
      .returning({ id: transactions.id })
    return updated.length
  })
  if (moved > 0) scheduleRecalculate()
  return { id: link.id, accountId, movedTransactions: moved }
}
