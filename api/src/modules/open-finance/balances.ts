// Saldos do Open Finance. A fonte é sempre a Pluggy; o banco guarda o último
// retrato (`open_finance_snapshots`) e é dele que as telas leem — ver
// snapshots.ts para o fluxo cache → Pluggy → último conhecido.
//
// O retrato é gravado em dois momentos:
// - no fim de cada sync, com as contas que o sync já buscou (sem chamada extra);
// - quando alguém lê um retrato vencido (> 15 min) ou pede `fresh`.

import { and, eq, sql } from "drizzle-orm"
import { db } from "../../db"
import { accounts, pluggyAccounts, pluggyTransactions, transactions } from "../../db/schema"
import { getProvider, isConfigured } from "./provider"
import { getSnapshot, writeSnapshot, type SnapshotMeta } from "./snapshots"
import type { ProviderAccount } from "./types"

export interface AccountBalance {
  /** Conta interna vinculada. */
  accountId: string
  accountName: string
  providerAccountId: string
  type: "BANK" | "CREDIT"
  /** BANK: saldo disponível. CREDIT: valor usado do limite (a dever). */
  balance: number
  creditLimit: number | null
  availableCredit: number | null
  /** Vencimento da fatura (yyyy-mm-dd). */
  dueDate: string | null
  minimumPayment: number | null
  /**
   * Só CREDIT: fatura do mês (a aberta, ainda a fechar/pagar), somando as
   * compras e descontando estornos. `balance` é a dívida total, com as parcelas
   * futuras — não é o que vence este mês. Null quando não dá para calcular.
   */
  monthBill?: number | null
}

interface BalancesData {
  accounts: AccountBalance[]
  /** Soma das contas BANK. */
  cash: number
  /** Soma do usado nos cartões. */
  cardDebt: number
}

export type Balances = SnapshotMeta & BalancesData

const EMPTY: BalancesData = { accounts: [], cash: 0, cardDebt: 0 }

function round2(value: number): number {
  return Number(value.toFixed(2))
}

/**
 * Fatura aberta do cartão. A Pluggy marca cada lançamento com `billForecastDate`
 * ("yyyy-mm") e a fatura aberta é a mais antiga que ainda tem lançamento
 * pendente. Pagamentos de fatura não entram (`kind` != regular). Parcelas
 * futuras caem em faturas posteriores e ficam de fora.
 */
async function openBillTotal(accountId: string): Promise<number | null> {
  const billMonth = sql<string | null>`${pluggyTransactions.payload}->'creditCardMetadata'->>'billForecastDate'`
  const rows = await db
    .select({ month: billMonth, total: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .innerJoin(pluggyTransactions, eq(pluggyTransactions.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.kind, "regular"),
        eq(transactions.status, "pending"),
        sql`${billMonth} is not null`
      )
    )
    .groupBy(billMonth)
    .orderBy(billMonth)
    .limit(1)
  return rows[0] ? round2(Number(rows[0].total)) : null
}

/** Monta o retrato a partir das contas da Pluggy, só as vinculadas. */
async function buildBalances(providerAccounts: ProviderAccount[]): Promise<BalancesData> {
  const links = await db
    .select({
      providerAccountId: pluggyAccounts.providerAccountId,
      accountId: pluggyAccounts.accountId,
      accountName: accounts.name,
    })
    .from(pluggyAccounts)
    .innerJoin(accounts, eq(pluggyAccounts.accountId, accounts.id))
  const linkByProviderId = new Map(links.map((l) => [l.providerAccountId, l]))

  const result: AccountBalance[] = []
  for (const account of providerAccounts) {
    const link = linkByProviderId.get(account.id)
    if (!link) continue
    result.push({
      monthBill: account.type === "CREDIT" ? await openBillTotal(link.accountId) : null,
      accountId: link.accountId,
      accountName: link.accountName,
      providerAccountId: account.id,
      type: account.type,
      balance: round2(Number(account.balance ?? 0)),
      creditLimit: account.creditData?.creditLimit ?? null,
      availableCredit: account.creditData?.availableCreditLimit ?? null,
      dueDate: account.creditData?.balanceDueDate?.slice(0, 10) ?? null,
      minimumPayment:
        account.creditData?.minimumPayment == null ? null : round2(account.creditData.minimumPayment),
    })
  }

  return {
    accounts: result,
    cash: round2(result.filter((a) => a.type === "BANK").reduce((s, a) => s + a.balance, 0)),
    cardDebt: round2(result.filter((a) => a.type === "CREDIT").reduce((s, a) => s + a.balance, 0)),
  }
}

async function fetchBalances(): Promise<BalancesData> {
  if (!isConfigured()) throw new Error("Open Finance não configurado")
  const provider = await getProvider()
  const perItem = await Promise.all(provider.itemIds().map((id) => provider.listAccounts(id)))
  const data = await buildBalances(perItem.flat())
  // Sem vínculo ainda (nunca sincronizou): não há o que guardar
  if (data.accounts.length === 0) throw new Error("Nenhuma conta sincronizada ainda")
  return data
}

/** Saldos: do banco quando recentes, da Pluggy quando vencidos ou `fresh`. */
export async function getBalances(options: { fresh?: boolean } = {}): Promise<Balances> {
  const { data, meta } = await getSnapshot("balances", fetchBalances, options)
  return { ...meta, ...(data ?? EMPTY) }
}

/** Grava o retrato com as contas que o sync acabou de buscar. */
export async function saveBalancesFromSync(providerAccounts: ProviderAccount[]): Promise<void> {
  const data = await buildBalances(providerAccounts)
  if (data.accounts.length > 0) await writeSnapshot("balances", data)
}
