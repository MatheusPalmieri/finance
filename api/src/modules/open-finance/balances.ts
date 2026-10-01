// Saldos do Open Finance. A fonte é sempre a Pluggy; o banco guarda o último
// retrato (`open_finance_snapshots`) e é dele que as telas leem — ver
// snapshots.ts para o fluxo cache → Pluggy → último conhecido.
//
// O retrato é gravado em dois momentos:
// - no fim de cada sync, com as contas e faturas que o sync já buscou;
// - quando alguém lê um retrato vencido (> 15 min) ou pede `fresh`.

import { and, eq, sql } from "drizzle-orm"
import { db } from "../../db"
import { accounts, pluggyAccounts, pluggyTransactions, transactions } from "../../db/schema"
import { log } from "./log"
import { getProvider, isConfigured, type OpenFinanceProvider } from "./provider"
import { getSnapshot, writeSnapshot, type SnapshotMeta } from "./snapshots"
import type { ProviderAccount, ProviderBill } from "./types"

/**
 * Fatura do cartão que está para ser paga.
 *
 * O mês é o `billForecastDate` mais antigo com lançamento pendente (= mês do
 * vencimento). Se o banco já fechou essa fatura, `GET /bills` traz o valor
 * oficial e ele vale; senão o total é a soma das compras (estimativa).
 */
export interface CardBill {
  /** "yyyy-mm" do vencimento. */
  month: string
  /** `true` = valor oficial do banco (fatura fechada); `false` = soma das compras. */
  official: boolean
  /** O que vai ser cobrado: o oficial quando existe, senão a soma das compras. */
  total: number
  /** Soma dos lançamentos que o Open Finance detalhou nessa fatura. */
  itemized: number
  /**
   * `total − itemized`: o que o banco cobra sem ter mandado o lançamento
   * (parcela que não veio, estorno lançado em outra fatura). 0 na estimativa.
   */
  undetailed: number
  /** yyyy-mm-dd. */
  dueDate: string | null
  closingDate: string | null
  minimumPayment: number | null
}

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
  /** Vencimento informado na conta (yyyy-mm-dd) — costuma ser o da última fatura fechada. */
  dueDate: string | null
  minimumPayment: number | null
  /**
   * Só CREDIT: a fatura a pagar. `balance` é a dívida total, com as parcelas
   * futuras — não é o que vence agora. Null quando não há lançamento pendente.
   */
  bill?: CardBill | null
}

interface BalancesData {
  accounts: AccountBalance[]
  /** Soma das contas BANK. */
  cash: number
  /** Soma do usado nos cartões. */
  cardDebt: number
}

export type Balances = SnapshotMeta & BalancesData

/** Faturas fechadas por conta do provedor (`providerAccountId`). */
export type BillsByAccount = Map<string, ProviderBill[]>

const EMPTY: BalancesData = { accounts: [], cash: 0, cardDebt: 0 }

function round2(value: number): number {
  return Number(value.toFixed(2))
}

/**
 * Faturas fechadas dos cartões. Falha na Pluggy não derruba o retrato: sem elas,
 * a fatura fica como estimativa (soma das compras).
 */
export async function fetchBills(
  provider: OpenFinanceProvider,
  providerAccounts: ProviderAccount[]
): Promise<BillsByAccount> {
  const out: BillsByAccount = new Map()
  for (const account of providerAccounts.filter((a) => a.type === "CREDIT")) {
    try {
      out.set(account.id, await provider.listBills(account.id))
    } catch (err) {
      log.error("faturas do cartão indisponíveis", {
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return out
}

/**
 * Fatura a pagar. A Pluggy marca cada lançamento com `billForecastDate`
 * ("yyyy-mm") e a fatura aberta é a mais antiga que ainda tem lançamento
 * pendente. Pagamentos de fatura não entram (`kind` != regular). Parcelas
 * futuras caem em faturas posteriores e ficam de fora.
 */
async function cardBill(
  accountId: string,
  bills: ProviderBill[],
  account: ProviderAccount
): Promise<CardBill | null> {
  const billMonth = sql<string | null>`${pluggyTransactions.payload}->'creditCardMetadata'->>'billForecastDate'`
  const [open] = await db
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
  if (!open?.month) return null

  const month = open.month
  const itemized = round2(Number(open.total))
  const closed = bills.find((b) => b.dueDate.slice(0, 7) === month)
  if (closed) {
    const total = round2(Number(closed.totalAmount))
    return {
      month,
      official: true,
      total,
      itemized,
      undetailed: round2(total - itemized),
      dueDate: closed.dueDate.slice(0, 10),
      closingDate: closed.billClosingDate?.slice(0, 10) ?? null,
      minimumPayment:
        closed.minimumPaymentAmount == null ? null : round2(closed.minimumPaymentAmount),
    }
  }

  // Ainda aberta: só a soma das compras. O vencimento da conta só vale se for
  // deste mês (costuma ser o da fatura anterior)
  const accountDue = account.creditData?.balanceDueDate?.slice(0, 10) ?? null
  return {
    month,
    official: false,
    total: itemized,
    itemized,
    undetailed: 0,
    dueDate: accountDue?.startsWith(month) ? accountDue : null,
    closingDate: null,
    minimumPayment: null,
  }
}

/** Monta o retrato a partir das contas da Pluggy, só as vinculadas. */
async function buildBalances(
  providerAccounts: ProviderAccount[],
  bills: BillsByAccount
): Promise<BalancesData> {
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
      bill:
        account.type === "CREDIT"
          ? await cardBill(link.accountId, bills.get(account.id) ?? [], account)
          : null,
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
  const providerAccounts = perItem.flat()
  const data = await buildBalances(providerAccounts, await fetchBills(provider, providerAccounts))
  // Sem vínculo ainda (nunca sincronizou): não há o que guardar
  if (data.accounts.length === 0) throw new Error("Nenhuma conta sincronizada ainda")
  return data
}

/** Saldos: do banco quando recentes, da Pluggy quando vencidos ou `fresh`. */
export async function getBalances(options: { fresh?: boolean } = {}): Promise<Balances> {
  const { data, meta } = await getSnapshot("balances", fetchBalances, options)
  return { ...meta, ...(data ?? EMPTY) }
}

/** Grava o retrato com as contas e faturas que o sync acabou de buscar. */
export async function saveBalancesFromSync(
  providerAccounts: ProviderAccount[],
  bills: BillsByAccount
): Promise<void> {
  const data = await buildBalances(providerAccounts, bills)
  if (data.accounts.length > 0) await writeSnapshot("balances", data)
}
