// Saldo ao vivo — decisão da spec 04: saldo e limite NUNCA são persistidos,
// são sempre buscados na Pluggy. O cache é só em memória e curto (60s), para
// várias telas pedindo ao mesmo tempo (Home, card de projeção) não virarem
// várias chamadas. Com a Pluggy fora do ar, `available: false` — não há valor
// salvo para cair de volta, e a UI mostra "saldo indisponível".

import { eq } from "drizzle-orm"
import { db } from "../../db"
import { accounts, pluggyAccounts } from "../../db/schema"
import { log } from "./log"
import { getProvider, isConfigured } from "./provider"
import type { ProviderAccount } from "./types"

export const BALANCE_CACHE_MS = 60_000

export interface LiveAccountBalance {
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
}

export interface LiveBalances {
  available: boolean
  /** Motivo quando `available` é false. */
  error: string | null
  fetchedAt: string
  accounts: LiveAccountBalance[]
  /** Soma das contas BANK. */
  cash: number
  /** Soma do usado nos cartões. */
  cardDebt: number
}

let cache: { at: number; value: LiveBalances } | null = null
let inFlight: Promise<LiveBalances> | null = null

function round2(value: number): number {
  return Number(value.toFixed(2))
}

function unavailable(error: string): LiveBalances {
  return {
    available: false,
    error,
    fetchedAt: new Date().toISOString(),
    accounts: [],
    cash: 0,
    cardDebt: 0,
  }
}

async function fetchBalances(): Promise<LiveBalances> {
  if (!isConfigured()) return unavailable("Open Finance não configurado")

  const links = await db
    .select({
      providerAccountId: pluggyAccounts.providerAccountId,
      accountId: pluggyAccounts.accountId,
      accountName: accounts.name,
    })
    .from(pluggyAccounts)
    .innerJoin(accounts, eq(pluggyAccounts.accountId, accounts.id))
  // Sem vínculo ainda (nunca sincronizou): nada a mostrar
  if (links.length === 0) return unavailable("Nenhuma conta sincronizada ainda")
  const linkByProviderId = new Map(links.map((l) => [l.providerAccountId, l]))

  try {
    const provider = await getProvider()
    const perItem = await Promise.all(provider.itemIds().map((id) => provider.listAccounts(id)))
    const providerAccounts: ProviderAccount[] = perItem.flat()

    const result: LiveAccountBalance[] = []
    for (const account of providerAccounts) {
      const link = linkByProviderId.get(account.id)
      if (!link) continue
      result.push({
        accountId: link.accountId,
        accountName: link.accountName,
        providerAccountId: account.id,
        type: account.type,
        balance: round2(Number(account.balance ?? 0)),
        creditLimit: account.creditData?.creditLimit ?? null,
        availableCredit: account.creditData?.availableCreditLimit ?? null,
        dueDate: account.creditData?.balanceDueDate?.slice(0, 10) ?? null,
        minimumPayment:
          account.creditData?.minimumPayment == null
            ? null
            : round2(account.creditData.minimumPayment),
      })
    }

    return {
      available: true,
      error: null,
      fetchedAt: new Date().toISOString(),
      accounts: result,
      cash: round2(result.filter((a) => a.type === "BANK").reduce((s, a) => s + a.balance, 0)),
      cardDebt: round2(result.filter((a) => a.type === "CREDIT").reduce((s, a) => s + a.balance, 0)),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error("saldo ao vivo indisponível", { message })
    return unavailable(message)
  }
}

/** Saldo ao vivo com cache em memória de 60s. `fresh` ignora o cache. */
export async function getLiveBalances(options: { fresh?: boolean } = {}): Promise<LiveBalances> {
  if (!options.fresh && cache && Date.now() - cache.at < BALANCE_CACHE_MS) return cache.value
  inFlight ??= fetchBalances()
    .then((value) => {
      // Falha não entra no cache: a próxima leitura tenta de novo
      cache = value.available ? { at: Date.now(), value } : null
      return value
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** Só para testes. */
export function __clearBalanceCache() {
  cache = null
  inFlight = null
}
