// Motor de sincronização: provedor → payload cru → `transactions`.
//
// Garantias (spec 04, F2–F4):
// - Idempotente pelo id do provedor (`transactions.external_id`).
// - Campos do usuário (nome, categoria, forma de pagamento, essencial,
//   recorrência, orçamento, observação) NUNCA são sobrescritos. O sync só
//   mexe no que é do banco: valor, data, status e natureza (`kind`).
// - A Pluggy troca o id quando uma transação muda (pendente → lançada, valor
//   ou data): a linha que sumiu é "religada" ao id novo em vez de apagada e
//   recriada, preservando a edição do usuário.
// - Linhas de CSV/manuais que já existiam são ADOTADAS (mesma conta, mesmo
//   valor, data local até 1 dia de diferença) em vez de duplicadas.
// - O que sumiu da janela buscada é removido — exceto se o provedor devolver
//   a conta vazia, que é mais provável ser falha do que extrato vazio.
// - Um sync por vez: advisory lock na transação do banco + dedupe em memória.
// - Saldo NÃO é tocado: é sempre buscado ao vivo (balances.ts).
// - `dryRun` roda exatamente o mesmo caminho e desfaz tudo no fim.

import { and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm"
import { db } from "../../db"
import {
  accounts,
  categories,
  pluggyAccounts,
  pluggyItems,
  pluggyTransactions,
  syncRuns,
  transactions,
  type NewTransaction,
  type SyncTrigger,
} from "../../db/schema"
import { scheduleRecalculate } from "../classification"
import { suggest } from "../classification/service"
import { log } from "./log"
import { normalizeTransaction, type NormalizedTransaction } from "./normalize"
import { getProvider, type OpenFinanceProvider } from "./provider"
import type { ProviderAccount, ProviderItem, ProviderTransaction } from "./types"

/** Janela completa: o máximo que a Pluggy guarda. */
export const FULL_WINDOW_DAYS = 365
/** O incremental volta alguns dias para pegar pendentes que viraram lançadas. */
export const INCREMENTAL_OVERLAP_DAYS = 7
/** Sem sync completo há mais que isso, o próximo é completo (detecta exclusões antigas). */
export const FULL_SYNC_EVERY_DAYS = 7
/** Distância máxima para religar uma linha cujo id mudou no provedor. */
const REBIND_MAX_DAYS = 5
/** Distância máxima para adotar uma linha de CSV/manual. */
const ADOPT_MAX_DAYS = 1
/** Espera pela nova coleta do banco depois do `refreshItem` (mutável nos testes). */
export const refreshTiming = { timeoutMs: 120_000, pollMs: 3_000 }
const FALLBACK_CATEGORY = "Outros"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface SyncOptions {
  trigger: SyncTrigger
  /** Força a janela completa (12 meses). */
  full?: boolean
  /** Pede ao banco uma coleta nova antes de ler (lento: espera a Pluggy). */
  refresh?: boolean
  /** Roda tudo e desfaz — só o relatório sobra. */
  dryRun?: boolean
  /** Camada de IA na classificação das linhas novas. Default: env ou `false`. */
  useAi?: boolean
}

export interface AccountReport {
  providerAccountId: string
  accountId: string
  accountName: string
  type: string
  from: string
  fetched: number
  created: number
  updated: number
  adopted: number
  removed: number
  unchanged: number
}

export interface SyncReport {
  runId: string | null
  dryRun: boolean
  full: boolean
  fetched: number
  created: number
  updated: number
  adopted: number
  removed: number
  unchanged: number
  accounts: AccountReport[]
  startedAt: string
  finishedAt: string
}

export class SyncBusyError extends Error {
  constructor() {
    super("Já existe uma sincronização em andamento")
    this.name = "SyncBusyError"
  }
}

class DryRunRollback extends Error {
  constructor(readonly report: SyncReport) {
    super("dry-run")
  }
}

// ── Datas ────────────────────────────────────────────────────────────────────

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return isoDate(d)
}

function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) /
      86_400_000
  )
}

function sameAmount(a: string | number, b: number): boolean {
  return Math.abs(Math.abs(Number(a)) - Math.abs(b)) < 0.005
}

// ── Coleta (rede, fora da transação do banco) ────────────────────────────────

interface FetchedAccount {
  account: ProviderAccount
  transactions: ProviderTransaction[]
}

interface FetchedItem {
  item: ProviderItem
  accounts: FetchedAccount[]
  from: string
  full: boolean
}

async function waitForRefresh(provider: OpenFinanceProvider, itemId: string) {
  await provider.refreshItem(itemId)
  const deadline = Date.now() + refreshTiming.timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, refreshTiming.pollMs))
    const item = await provider.getItem(itemId)
    if (item.status !== "UPDATING") return
  }
  log.info("coleta do banco ainda em andamento; sincronizando o que já existe", {
    itemId,
  })
}

async function fetchItem(
  provider: OpenFinanceProvider,
  itemId: string,
  opts: SyncOptions
): Promise<FetchedItem> {
  if (opts.refresh) await waitForRefresh(provider, itemId)

  const [stored] = await db
    .select()
    .from(pluggyItems)
    .where(eq(pluggyItems.itemId, itemId))
    .limit(1)

  const today = isoDate(new Date())
  const fullDue =
    !stored?.lastFullSyncAt ||
    Date.now() - stored.lastFullSyncAt.getTime() > FULL_SYNC_EVERY_DAYS * 86_400_000
  const full = Boolean(opts.full) || !stored?.lastSyncedAt || fullDue
  const from = full
    ? shiftDays(today, -FULL_WINDOW_DAYS)
    : shiftDays(isoDate(stored!.lastSyncedAt!), -INCREMENTAL_OVERLAP_DAYS)

  const item = await provider.getItem(itemId)
  const providerAccounts = await provider.listAccounts(itemId)
  const fetched: FetchedAccount[] = []
  for (const account of providerAccounts) {
    fetched.push({
      account,
      transactions: await provider.listTransactions(account.id, { from }),
    })
  }
  return { item, accounts: fetched, from, full }
}

// ── Vínculo de contas ────────────────────────────────────────────────────────

/**
 * Conta interna de cada conta do provedor. Primeira vez: conta corrente →
 * conta com o nome do banco ("Nubank", que já guarda o histórico do CSV);
 * cartão → "<banco> Cartão". Cria se não existir. O vínculo fica em
 * `pluggy_accounts` e pode ser trocado depois pela API.
 */
async function ensureAccountLink(
  tx: Tx,
  pluggyItemRowId: string,
  connectorName: string,
  account: ProviderAccount
) {
  const [linked] = await tx
    .select()
    .from(pluggyAccounts)
    .where(eq(pluggyAccounts.providerAccountId, account.id))
    .limit(1)
  if (linked) return linked

  const isCard = account.type === "CREDIT"
  const name = isCard ? `${connectorName} Cartão` : connectorName
  const types = isCard
    ? (["CREDIT_CARD"] as const)
    : (["CHECKING", "SAVINGS"] as const)

  let [internal] = await tx
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.name, name),
        inArray(accounts.type, [...types]),
        eq(accounts.isSandbox, false)
      )
    )
    .limit(1)
  if (!internal) {
    ;[internal] = await tx
      .insert(accounts)
      .values({
        name,
        type: isCard ? "CREDIT_CARD" : "CHECKING",
        color: isCard ? "#8b5cf6" : "#7c3aed",
        icon: isCard ? "credit-card" : "building-bank",
      })
      .returning()
  }

  const [created] = await tx
    .insert(pluggyAccounts)
    .values({
      pluggyItemId: pluggyItemRowId,
      providerAccountId: account.id,
      accountId: internal.id,
      type: account.type,
      subtype: account.subtype ?? null,
      name: account.name ?? account.marketingName ?? null,
      number: account.number ?? null,
    })
    .returning()
  return created
}

// ── Aplicação de uma conta ───────────────────────────────────────────────────

interface ApplyContext {
  tx: Tx
  pluggyAccountId: string
  accountId: string
  accountType: ProviderAccount["type"]
  from: string
  fallbackCategoryId: string
  categoryIdByName: Map<string, string>
  useAi: boolean
}

async function applyAccount(
  ctx: ApplyContext,
  fetched: ProviderTransaction[]
): Promise<Omit<AccountReport, "providerAccountId" | "accountId" | "accountName" | "type" | "from">> {
  const { tx } = ctx
  const counts = { fetched: fetched.length, created: 0, updated: 0, adopted: 0, removed: 0, unchanged: 0 }
  const normalized = fetched.map((raw) => ({
    raw,
    n: normalizeTransaction(raw, ctx.accountType),
  }))
  const fetchedIds = new Set(normalized.map(({ n }) => n.externalId))

  // Linhas desta conta que o sync já conhece: as da janela e qualquer uma que
  // o provedor devolveu agora. A janela é em data local e o `dateFrom` da
  // Pluggy em UTC — uma transação da madrugada pode vir com data local anterior
  // ao início da janela e precisa ser reconhecida, não reinserida.
  const known = await tx
    .select({
      id: transactions.id,
      externalId: transactions.externalId,
      amount: transactions.amount,
      date: transactions.date,
      status: transactions.status,
      kind: transactions.kind,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, ctx.accountId),
        eq(transactions.source, "open_finance"),
        fetchedIds.size > 0
          ? or(gte(transactions.date, ctx.from), inArray(transactions.externalId, [...fetchedIds]))
          : gte(transactions.date, ctx.from)
      )
    )
  const byExternalId = new Map(known.map((row) => [row.externalId, row]))
  // Sumiram do provedor dentro da janela: candidatas a religar (id trocado) ou remover
  const vanished = known.filter(
    (row) => row.date >= ctx.from && row.externalId && !fetchedIds.has(row.externalId)
  )

  // Linhas de CSV/manuais ainda sem vínculo — candidatas à adoção
  const adoptable = await tx
    .select({ id: transactions.id, amount: transactions.amount, date: transactions.date })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, ctx.accountId),
        isNull(transactions.externalId),
        ne(transactions.source, "open_finance"),
        gte(transactions.date, shiftDays(ctx.from, -ADOPT_MAX_DAYS))
      )
    )

  const providerFields = (n: NormalizedTransaction) => ({
    amount: n.amount.toFixed(2),
    date: n.date,
    status: n.status,
    kind: n.kind,
  })

  const pickClosest = <T extends { amount: string; date: string }>(
    pool: T[],
    n: NormalizedTransaction,
    maxDays: number
  ): T | null => {
    let best: T | null = null
    let bestDistance = Infinity
    for (const row of pool) {
      if (!sameAmount(row.amount, n.amount)) continue
      const distance = daysBetween(row.date, n.date)
      if (distance <= maxDays && distance < bestDistance) {
        best = row
        bestDistance = distance
      }
    }
    return best
  }

  const rawLinks: { providerTransactionId: string; transactionId: string | null; payload: unknown }[] = []
  const toInsert: { raw: ProviderTransaction; n: NormalizedTransaction }[] = []

  for (const { raw, n } of normalized) {
    const existing = byExternalId.get(n.externalId)
    if (existing) {
      const changed =
        Number(existing.amount).toFixed(2) !== n.amount.toFixed(2) ||
        existing.date !== n.date ||
        existing.status !== n.status ||
        existing.kind !== n.kind
      if (changed) {
        await tx.update(transactions).set(providerFields(n)).where(eq(transactions.id, existing.id))
        counts.updated++
      } else {
        counts.unchanged++
      }
      rawLinks.push({ providerTransactionId: n.externalId, transactionId: existing.id, payload: raw })
      continue
    }

    // Id novo para uma linha que já existia (a Pluggy recria ao mudar)
    const rebind = pickClosest(vanished, n, REBIND_MAX_DAYS)
    if (rebind) {
      vanished.splice(vanished.indexOf(rebind), 1)
      await tx
        .update(transactions)
        .set({ externalId: n.externalId, ...providerFields(n) })
        .where(eq(transactions.id, rebind.id))
      counts.updated++
      rawLinks.push({ providerTransactionId: n.externalId, transactionId: rebind.id, payload: raw })
      continue
    }

    // Já importada por CSV ou lançada à mão: adota, mantendo a classificação
    const adopt = pickClosest(adoptable, n, ADOPT_MAX_DAYS)
    if (adopt) {
      adoptable.splice(adoptable.indexOf(adopt), 1)
      await tx
        .update(transactions)
        .set({ externalId: n.externalId, source: "open_finance", ...providerFields(n) })
        .where(eq(transactions.id, adopt.id))
      counts.adopted++
      rawLinks.push({ providerTransactionId: n.externalId, transactionId: adopt.id, payload: raw })
      continue
    }

    toInsert.push({ raw, n })
  }

  // ── Novas: classificação em lote e insert ──────────────────────────────────
  if (toInsert.length > 0) {
    const classified = await suggest({
      useAi: ctx.useAi,
      items: toInsert.map(({ n }, index) => ({
        index,
        description: n.name,
        date: n.date,
        amount: n.amount,
      })),
    })
    const byIndex = new Map(classified.items.map((s) => [s.index, s]))

    const values: NewTransaction[] = toInsert.map(({ n }, index) => {
      const s = byIndex.get(index)
      const isIncome = n.amount < 0
      const categoryId =
        s?.categoryId ??
        (n.localCategoryName ? ctx.categoryIdByName.get(n.localCategoryName.toLowerCase()) : undefined) ??
        ctx.fallbackCategoryId
      // Gasto fixo exige orçamento (regra da rota); sem ele, fica variável
      const recurrence = s?.recurrence === "fixed" && s.budgetId ? "fixed" : "variable"
      return {
        name: (s?.suggestedName ?? n.name).slice(0, 255),
        amount: n.amount.toFixed(2),
        categoryId,
        // No cartão é sempre crédito; na conta, a regra aprendida manda
        paymentMethod:
          ctx.accountType === "CREDIT" ? "credit_card" : (s?.paymentMethod ?? n.paymentMethod),
        accountId: ctx.accountId,
        isEssential: isIncome ? false : (s?.isEssential ?? false),
        recurrence,
        budgetId: recurrence === "fixed" ? s!.budgetId : null,
        date: n.date,
        source: "open_finance",
        externalId: n.externalId,
        status: n.status,
        kind: n.kind,
      }
    })

    const rawById = new Map(toInsert.map(({ raw, n }) => [n.externalId, raw]))
    for (let i = 0; i < values.length; i += 500) {
      const inserted = await tx
        .insert(transactions)
        .values(values.slice(i, i + 500))
        .returning({ id: transactions.id, externalId: transactions.externalId })
      for (const row of inserted) {
        rawLinks.push({
          providerTransactionId: row.externalId!,
          transactionId: row.id,
          payload: rawById.get(row.externalId!),
        })
      }
    }
    counts.created += values.length
  }

  // ── Removidas no provedor ──────────────────────────────────────────────────
  // Conta devolvida vazia é mais provável falha do provedor que extrato vazio
  if (vanished.length > 0 && fetched.length > 0) {
    const ids = vanished.map((row) => row.id)
    await tx.delete(transactions).where(inArray(transactions.id, ids))
    await tx
      .delete(pluggyTransactions)
      .where(inArray(pluggyTransactions.providerTransactionId, vanished.map((row) => row.externalId!)))
    counts.removed += ids.length
  }

  // ── Payload cru ────────────────────────────────────────────────────────────
  for (let i = 0; i < rawLinks.length; i += 500) {
    await tx
      .insert(pluggyTransactions)
      .values(
        rawLinks.slice(i, i + 500).map((link) => ({
          providerTransactionId: link.providerTransactionId,
          pluggyAccountId: ctx.pluggyAccountId,
          transactionId: link.transactionId,
          payload: link.payload,
        }))
      )
      .onConflictDoUpdate({
        target: pluggyTransactions.providerTransactionId,
        set: {
          transactionId: sql`excluded.transaction_id`,
          payload: sql`excluded.payload`,
          updatedAt: new Date(),
        },
      })
  }

  return counts
}

// ── Orquestração ─────────────────────────────────────────────────────────────

async function execute(opts: SyncOptions, runId: string | null): Promise<SyncReport> {
  const startedAt = new Date()
  const provider = await getProvider()
  const useAi = opts.useAi ?? process.env.OPEN_FINANCE_SYNC_USE_AI === "true"

  // Rede primeiro, banco depois: a transação não fica aberta esperando a Pluggy
  const fetchedItems: FetchedItem[] = []
  for (const itemId of provider.itemIds()) {
    fetchedItems.push(await fetchItem(provider, itemId, opts))
  }

  const report: SyncReport = {
    runId,
    dryRun: Boolean(opts.dryRun),
    full: fetchedItems.some((f) => f.full),
    fetched: 0,
    created: 0,
    updated: 0,
    adopted: 0,
    removed: 0,
    unchanged: 0,
    accounts: [],
    startedAt: startedAt.toISOString(),
    finishedAt: "",
  }

  const run = async (tx: Tx) => {
    const [{ locked }] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext('open-finance-sync')) as locked`
    )
    if (!locked) throw new SyncBusyError()

    const catalog = await tx.select({ id: categories.id, name: categories.name }).from(categories)
    const categoryIdByName = new Map(catalog.map((c) => [c.name.toLowerCase(), c.id]))
    const fallbackCategoryId = categoryIdByName.get(FALLBACK_CATEGORY.toLowerCase())
    if (!fallbackCategoryId) {
      throw new Error(`Categoria "${FALLBACK_CATEGORY}" não encontrada — rode o db:seed`)
    }

    for (const fetched of fetchedItems) {
      const connectorName = fetched.item.connector?.name ?? "Banco"
      const itemValues = {
        itemId: fetched.item.id,
        connectorName,
        status: fetched.item.status ?? null,
        executionStatus: fetched.item.executionStatus ?? null,
        providerUpdatedAt: fetched.item.lastUpdatedAt ? new Date(fetched.item.lastUpdatedAt) : null,
      }
      const [itemRow] = await tx
        .insert(pluggyItems)
        .values(itemValues)
        .onConflictDoUpdate({ target: pluggyItems.itemId, set: itemValues })
        .returning()

      for (const { account, transactions: providerTxs } of fetched.accounts) {
        const link = await ensureAccountLink(tx, itemRow.id, connectorName, account)
        const [internal] = await tx
          .select({ name: accounts.name })
          .from(accounts)
          .where(eq(accounts.id, link.accountId))
        const counts = await applyAccount(
          {
            tx,
            pluggyAccountId: link.id,
            accountId: link.accountId,
            accountType: account.type,
            from: fetched.from,
            fallbackCategoryId,
            categoryIdByName,
            useAi,
          },
          providerTxs
        )
        report.accounts.push({
          providerAccountId: account.id,
          accountId: link.accountId,
          accountName: internal?.name ?? "",
          type: account.type,
          from: fetched.from,
          ...counts,
        })
        report.fetched += counts.fetched
        report.created += counts.created
        report.updated += counts.updated
        report.adopted += counts.adopted
        report.removed += counts.removed
        report.unchanged += counts.unchanged
      }

      const now = new Date()
      await tx
        .update(pluggyItems)
        .set({ lastSyncedAt: now, ...(fetched.full ? { lastFullSyncAt: now } : {}) })
        .where(eq(pluggyItems.id, itemRow.id))
    }

    report.finishedAt = new Date().toISOString()
    if (opts.dryRun) throw new DryRunRollback(report)
  }

  try {
    await db.transaction(run)
  } catch (err) {
    if (err instanceof DryRunRollback) return err.report
    throw err
  }
  return report
}

let inFlight: Promise<SyncReport> | null = null

/** `true` enquanto um sync roda neste processo. */
export function isSyncRunning(): boolean {
  return inFlight !== null
}

/**
 * Roda um sync. Chamadas simultâneas no mesmo processo recebem o mesmo
 * resultado; entre processos, o advisory lock devolve `SyncBusyError`.
 */
export async function runSync(opts: SyncOptions): Promise<SyncReport> {
  if (opts.dryRun) return execute(opts, null)
  if (inFlight) return inFlight

  inFlight = (async () => {
    const [runRow] = await db
      .insert(syncRuns)
      .values({ trigger: opts.trigger, full: Boolean(opts.full) })
      .returning({ id: syncRuns.id })
    try {
      const report = await execute(opts, runRow.id)
      await db
        .update(syncRuns)
        .set({
          status: "success",
          full: report.full,
          fetched: report.fetched,
          created: report.created,
          updated: report.updated,
          adopted: report.adopted,
          removed: report.removed,
          finishedAt: new Date(),
        })
        .where(eq(syncRuns.id, runRow.id))
      scheduleRecalculate()
      log.info("sync concluído", {
        trigger: opts.trigger,
        full: report.full,
        fetched: report.fetched,
        created: report.created,
        updated: report.updated,
        adopted: report.adopted,
        removed: report.removed,
      })
      return report
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db
        .update(syncRuns)
        .set({ status: "error", errorMessage: message.slice(0, 2000), finishedAt: new Date() })
        .where(eq(syncRuns.id, runRow.id))
      log.error("sync falhou", { trigger: opts.trigger, message })
      throw err
    }
  })().finally(() => {
    inFlight = null
  })
  return inFlight
}
