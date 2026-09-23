// Provedor Pluggy (https://docs.pluggy.ai). Toda chamada sai do backend com o
// `X-API-KEY` de curta duração derivado de CLIENT_ID/CLIENT_SECRET — nada
// disso chega ao frontend nem ao log.
//
// Endpoints (verificados com a conta real em 2026-09-23, ver infra/pluggy-probe.md):
//   POST  /auth                                   -> { apiKey }
//   GET   /items/{id}                             -> Item
//   PATCH /items/{id}                             -> reexecuta a coleta
//   GET   /accounts?itemId=                       -> { results }
//   GET   /v2/transactions?accountId=&dateFrom=&after=  -> { results, next }
//   GET   /investments?itemId=&pageSize=          -> { results }
//   GET   /investments/{id}/transactions?pageSize=      -> { results }

import { httpJson } from "../http"
import type { OpenFinanceProvider } from "../provider"
import type {
  ListTransactionsOptions,
  ProviderAccount,
  ProviderInvestment,
  ProviderInvestmentTransaction,
  ProviderItem,
  ProviderTransaction,
} from "../types"

// Teto de segurança da paginação por cursor (500 por página)
const MAX_TX_PAGES = 60
// A apiKey da Pluggy vale ~2h; renova bem antes para não expirar no meio do sync
const API_KEY_TTL_MS = 90 * 60 * 1000

function requireEnv(key: string): string {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${key}`)
  return value
}

export class PluggyProvider implements OpenFinanceProvider {
  readonly name = "pluggy"
  #baseUrl = process.env.PLUGGY_BASE_URL?.trim() || "https://api.pluggy.ai"
  #apiKey: string | null = null
  #apiKeyExpiresAt = 0
  #authInFlight: Promise<string> | null = null

  itemIds(): string[] {
    return requireEnv("PLUGGY_ITEM_IDS")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  }

  async #auth(): Promise<string> {
    if (this.#apiKey && Date.now() < this.#apiKeyExpiresAt) return this.#apiKey
    // Várias telas pedindo saldo ao mesmo tempo compartilham um /auth só
    this.#authInFlight ??= httpJson<{ apiKey: string }>(`${this.#baseUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: requireEnv("PLUGGY_CLIENT_ID"),
        clientSecret: requireEnv("PLUGGY_CLIENT_SECRET"),
      }),
      retries: 1,
    })
      .then(({ apiKey }) => {
        this.#apiKey = apiKey
        this.#apiKeyExpiresAt = Date.now() + API_KEY_TTL_MS
        return apiKey
      })
      .finally(() => {
        this.#authInFlight = null
      })
    return this.#authInFlight
  }

  async #get<T>(path: string, init?: RequestInit): Promise<T> {
    const apiKey = await this.#auth()
    return httpJson<T>(`${this.#baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
        ...init?.headers,
      },
    })
  }

  getItem(itemId: string) {
    return this.#get<ProviderItem>(`/items/${encodeURIComponent(itemId)}`)
  }

  async refreshItem(itemId: string) {
    // PATCH com corpo vazio reexecuta a coleta com o consentimento já existente
    await this.#get(`/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    })
  }

  async listAccounts(itemId: string) {
    const res = await this.#get<{ results: ProviderAccount[] }>(
      `/accounts?itemId=${encodeURIComponent(itemId)}`
    )
    return res.results
  }

  async listTransactions(accountId: string, opts: ListTransactionsOptions = {}) {
    const all: ProviderTransaction[] = []
    let after: string | null = null
    for (let page = 0; page < MAX_TX_PAGES; page++) {
      const params = new URLSearchParams({ accountId })
      if (opts.from) params.set("dateFrom", opts.from)
      if (after) params.set("after", after)
      const res = await this.#get<{
        results: ProviderTransaction[]
        next?: string | null
      }>(`/v2/transactions?${params}`)
      all.push(...res.results)
      after = extractAfterCursor(res.next)
      if (!after) break
    }
    return all
  }

  async listInvestments(itemId: string) {
    const res = await this.#get<{ results: ProviderInvestment[] }>(
      `/investments?itemId=${encodeURIComponent(itemId)}&pageSize=500`
    )
    return res.results
  }

  async listInvestmentTransactions(investmentId: string) {
    const res = await this.#get<{ results: ProviderInvestmentTransaction[] }>(
      `/investments/${encodeURIComponent(investmentId)}/transactions?pageSize=500`
    )
    return res.results
  }
}

// `next` vem como "?accountId=...&after=<cursor>" (ou null na última página)
export function extractAfterCursor(next: string | null | undefined): string | null {
  if (!next) return null
  const qs = next.includes("?") ? next.slice(next.indexOf("?") + 1) : next
  return new URLSearchParams(qs).get("after")
}
