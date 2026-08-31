// Orquestração do módulo Open Finance. Somente leitura: registra conexões,
// sincroniza contas/transações externas e responde webhooks. Nunca escreve em
// `transactions` — os dados externos vivem nas tabelas `open_finance_*`.

import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm"
import { db } from "../../db"
import {
  openFinanceAccounts,
  openFinanceConnections,
  openFinanceSyncRuns,
  openFinanceTransactions,
  type OfConnectionStatus,
  type OfSyncTrigger,
  type OpenFinanceConnection,
  type OpenFinanceSyncRun,
} from "../../db/schema"
import { getProvider } from "./provider"
import { planSync } from "./normalize"
import { log } from "./log"
import type { CreateConnectionInput } from "./types"

// Buffer de dias re-baixados a cada sync incremental (transações PENDING mudam)
const INCREMENTAL_OVERLAP_DAYS = 5
const INSERT_CHUNK = 500

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fromDateFor(connection: OpenFinanceConnection): string | undefined {
  if (!connection.lastSyncedAt) return undefined
  const from = new Date(connection.lastSyncedAt)
  from.setDate(from.getDate() - INCREMENTAL_OVERLAP_DAYS)
  return isoDay(from)
}

// ── Conexões ─────────────────────────────────────────────────────────────────

export async function createConnection(input: CreateConnectionInput) {
  const provider = await getProvider()
  const pc = await provider.createConnection(input)

  const [connection] = await db
    .insert(openFinanceConnections)
    .values({
      provider: provider.name,
      providerItemId: pc.providerItemId,
      connectorId: pc.connectorId ?? null,
      connectorName: pc.connectorName ?? null,
      status: pc.status,
      statusDetail: pc.statusDetail ?? null,
      rawPayload: pc.raw,
    })
    .onConflictDoUpdate({
      target: openFinanceConnections.providerItemId,
      set: {
        status: pc.status,
        statusDetail: pc.statusDetail ?? null,
        connectorId: pc.connectorId ?? null,
        connectorName: pc.connectorName ?? null,
        rawPayload: pc.raw,
      },
    })
    .returning()

  log.info("conexão registrada", {
    connectionId: connection.id,
    connector: connection.connectorName,
    status: connection.status,
  })

  // Sincronização inicial — falha aqui não desfaz a conexão registrada.
  let syncRun: OpenFinanceSyncRun | null = null
  try {
    syncRun = await runSync(connection, "INITIAL")
  } catch (err) {
    log.error("falha na sincronização inicial", {
      connectionId: connection.id,
      message: errMessage(err),
    })
  }

  return { connection: await getConnectionRow(connection.id), syncRun }
}

export async function listConnections() {
  return db.query.openFinanceConnections.findMany({
    orderBy: [desc(openFinanceConnections.createdAt)],
    with: { accounts: true, syncRuns: { orderBy: [desc(openFinanceSyncRuns.startedAt)], limit: 1 } },
  })
}

async function getConnectionRow(id: string) {
  return db.query.openFinanceConnections.findFirst({
    where: eq(openFinanceConnections.id, id),
    with: { accounts: true, syncRuns: { orderBy: [desc(openFinanceSyncRuns.startedAt)], limit: 1 } },
  })
}

export async function deleteConnection(id: string): Promise<boolean> {
  const connection = await db.query.openFinanceConnections.findFirst({
    where: eq(openFinanceConnections.id, id),
  })
  if (!connection) return false

  const provider = await getProvider()
  try {
    await provider.deleteConnection(connection.providerItemId)
  } catch (err) {
    // Se o provedor já não tem o item, seguimos com a remoção local.
    log.error("erro ao desconectar no provedor", {
      connectionId: id,
      message: errMessage(err),
    })
  }

  // Cascade remove contas, transações e execuções.
  await db.delete(openFinanceConnections).where(eq(openFinanceConnections.id, id))
  log.info("conexão removida", { connectionId: id })
  return true
}

// ── Sincronização ────────────────────────────────────────────────────────────

export async function syncConnection(
  id: string,
  trigger: OfSyncTrigger
): Promise<OpenFinanceSyncRun | null> {
  const connection = await db.query.openFinanceConnections.findFirst({
    where: eq(openFinanceConnections.id, id),
  })
  if (!connection) return null
  return runSync(connection, trigger)
}

async function runSync(
  connection: OpenFinanceConnection,
  trigger: OfSyncTrigger
): Promise<OpenFinanceSyncRun> {
  const provider = await getProvider()
  const [run] = await db
    .insert(openFinanceSyncRuns)
    .values({ connectionId: connection.id, status: "RUNNING", trigger })
    .returning()

  let accountsSynced = 0
  let created = 0
  let updated = 0

  try {
    // Estado atual do item no provedor
    const pc = await provider.getConnection(connection.providerItemId)
    await setConnectionStatus(connection.id, pc.status, pc.statusDetail ?? null, pc.raw)

    if (pc.status === "LOGIN_ERROR" || pc.status === "ERROR") {
      throw new Error(
        pc.statusDetail ?? `Conexão em estado ${pc.status} no provedor`
      )
    }

    const providerAccounts = await provider.listAccounts(connection.providerItemId)

    // Só entra em modo incremental depois que já existe histórico armazenado.
    // Evita perder transações antigas quando a 1ª sync termina antes de o
    // provedor concluir a coleta.
    const [{ stored }] = await db
      .select({ stored: count() })
      .from(openFinanceTransactions)
      .where(eq(openFinanceTransactions.connectionId, connection.id))
    const from = stored > 0 ? fromDateFor(connection) : undefined

    for (const pa of providerAccounts) {
      const [ofAccount] = await db
        .insert(openFinanceAccounts)
        .values({
          connectionId: connection.id,
          providerAccountId: pa.providerAccountId,
          type: pa.type ?? null,
          name: pa.name ?? null,
          number: pa.number ?? null,
          balance: pa.balance != null ? pa.balance.toFixed(2) : null,
          currencyCode: pa.currencyCode ?? "BRL",
          rawPayload: pa.raw,
        })
        .onConflictDoUpdate({
          target: openFinanceAccounts.providerAccountId,
          set: {
            type: pa.type ?? null,
            name: pa.name ?? null,
            number: pa.number ?? null,
            balance: pa.balance != null ? pa.balance.toFixed(2) : null,
            currencyCode: pa.currencyCode ?? "BRL",
            rawPayload: pa.raw,
          },
        })
        .returning()
      accountsSynced++

      const providerTxs = await provider.listTransactions(pa.providerAccountId, {
        from,
      })

      const existing = await db
        .select({ id: openFinanceTransactions.providerTransactionId })
        .from(openFinanceTransactions)
        .where(eq(openFinanceTransactions.ofAccountId, ofAccount.id))
      const existingIds = new Set(existing.map((r) => r.id))

      const plan = planSync(providerTxs, existingIds)

      for (let i = 0; i < plan.toInsert.length; i += INSERT_CHUNK) {
        const chunk = plan.toInsert.slice(i, i + INSERT_CHUNK)
        const inserted = await db
          .insert(openFinanceTransactions)
          .values(
            chunk.map((n) => ({
              connectionId: connection.id,
              ofAccountId: ofAccount.id,
              providerTransactionId: n.providerTransactionId,
              description: n.description.slice(0, 500),
              amount: n.amount,
              currencyCode: n.currencyCode,
              date: n.date,
              direction: n.direction,
              status: n.status,
              category: n.category,
              rawPayload: n.rawPayload,
            }))
          )
          // Corrida com webhook simultâneo: se já existe, não duplica.
          .onConflictDoNothing({
            target: openFinanceTransactions.providerTransactionId,
          })
          .returning({ id: openFinanceTransactions.id })
        created += inserted.length
      }

      for (const n of plan.toUpdate) {
        await db
          .update(openFinanceTransactions)
          .set({
            description: n.description.slice(0, 500),
            amount: n.amount,
            currencyCode: n.currencyCode,
            date: n.date,
            direction: n.direction,
            status: n.status,
            category: n.category,
            rawPayload: n.rawPayload,
          })
          .where(
            eq(
              openFinanceTransactions.providerTransactionId,
              n.providerTransactionId
            )
          )
        updated++
      }
    }

    const now = new Date()
    await db
      .update(openFinanceConnections)
      .set({ lastSyncedAt: now, status: "ACTIVE", statusDetail: null })
      .where(eq(openFinanceConnections.id, connection.id))

    const [finished] = await db
      .update(openFinanceSyncRuns)
      .set({
        status: "SUCCESS",
        finishedAt: now,
        accountsSynced,
        transactionsCreated: created,
        transactionsUpdated: updated,
      })
      .where(eq(openFinanceSyncRuns.id, run.id))
      .returning()

    log.info("sincronização concluída", {
      connectionId: connection.id,
      trigger,
      accountsSynced,
      created,
      updated,
    })
    return finished
  } catch (err) {
    const message = errMessage(err)
    log.error("sincronização falhou", { connectionId: connection.id, trigger, message })
    const [finished] = await db
      .update(openFinanceSyncRuns)
      .set({
        status: "ERROR",
        finishedAt: new Date(),
        errorMessage: message,
        accountsSynced,
        transactionsCreated: created,
        transactionsUpdated: updated,
      })
      .where(eq(openFinanceSyncRuns.id, run.id))
      .returning()
    return finished
  }
}

async function setConnectionStatus(
  id: string,
  status: OfConnectionStatus,
  detail: string | null,
  raw: unknown
) {
  await db
    .update(openFinanceConnections)
    .set({ status, statusDetail: detail, rawPayload: raw })
    .where(eq(openFinanceConnections.id, id))
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

// Eventos da Pluggy (doc "Webhooks") que devem disparar uma sincronização.
const SYNC_EVENTS = [
  "item/updated",
  "item/created",
  "item/login_succeeded",
  "transactions/created",
  "transactions/updated",
  "transactions/deleted",
  "connector/status_updated",
]

export async function handleWebhook(payload: unknown) {
  const provider = await getProvider()
  const event = provider.parseWebhook(payload)
  log.info("webhook recebido", { event: event.event, hasItem: !!event.providerItemId })

  if (!event.providerItemId) return { received: true, handled: false }

  const connection = await db.query.openFinanceConnections.findFirst({
    where: eq(openFinanceConnections.providerItemId, event.providerItemId),
  })
  if (!connection) return { received: true, handled: false }

  if (event.event.startsWith("item/deleted")) {
    await db
      .update(openFinanceConnections)
      .set({ status: "DELETED" })
      .where(eq(openFinanceConnections.id, connection.id))
    return { received: true, handled: true }
  }

  if (
    event.event === "item/waiting_user_input" ||
    event.event === "item/waiting_user_action"
  ) {
    await db
      .update(openFinanceConnections)
      .set({ status: "PENDING" })
      .where(eq(openFinanceConnections.id, connection.id))
    return { received: true, handled: true }
  }

  // item/error e connector/status_updated também levam a re-sincronizar para
  // capturar o statusDetail atual do provedor.
  if (
    event.event === "item/error" ||
    SYNC_EVENTS.some((e) => event.event.startsWith(e))
  ) {
    // Não bloqueia a resposta do webhook — o provedor só quer 200 rápido.
    void runSync(connection, "WEBHOOK").catch((err) =>
      log.error("sync via webhook falhou", {
        connectionId: connection.id,
        message: errMessage(err),
      })
    )
    return { received: true, handled: true }
  }

  return { received: true, handled: false }
}

// ── Leitura de transações externas ───────────────────────────────────────────

export async function listConnectionTransactions(
  id: string,
  params: { page?: number; limit?: number; from?: string; to?: string }
) {
  const connection = await db.query.openFinanceConnections.findFirst({
    where: eq(openFinanceConnections.id, id),
    with: { accounts: true },
  })
  if (!connection) return null

  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(200, Math.max(1, params.limit ?? 50))
  const accountIds = connection.accounts.map((a) => a.id)
  if (accountIds.length === 0) {
    return { data: [], total: 0, page, limit }
  }

  const conditions = [inArray(openFinanceTransactions.ofAccountId, accountIds)]
  if (params.from) conditions.push(gte(openFinanceTransactions.date, params.from))
  if (params.to) conditions.push(lte(openFinanceTransactions.date, params.to))
  const where = and(...conditions)

  const rows = await db.query.openFinanceTransactions.findMany({
    where,
    orderBy: [
      desc(openFinanceTransactions.date),
      desc(openFinanceTransactions.createdAt),
    ],
    limit,
    offset: (page - 1) * limit,
  })
  const [{ total }] = await db
    .select({ total: count() })
    .from(openFinanceTransactions)
    .where(where)

  return { data: rows, total, page, limit }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Erro desconhecido"
}
