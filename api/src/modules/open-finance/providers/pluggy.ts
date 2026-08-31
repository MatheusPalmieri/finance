// Provedor Pluggy (https://docs.pluggy.ai). Somente leitura: itens, contas e
// transações. Toda chamada sai do backend com o `X-API-KEY` de curta duração
// derivado de CLIENT_ID/CLIENT_SECRET — nada disso vai para o frontend.

import { httpJson } from "../http"
import type { OpenFinanceProvider } from "../provider"
import type {
  CreateConnectionInput,
  ListTransactionsOptions,
  OpenFinanceConnectionStatus,
  ProviderAccount,
  ProviderConnection,
  ProviderTransaction,
  WebhookEvent,
} from "../types"

const PAGE_SIZE = 500
const MAX_PAGES = 50 // teto de segurança (~25k transações por conta)

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${key}`)
  return value
}

// Pluggy item.status → status agnóstico do projeto
function mapStatus(status: string): OpenFinanceConnectionStatus {
  switch (status) {
    case "UPDATED":
      return "ACTIVE"
    case "UPDATING":
    case "LOGIN_IN_PROGRESS":
      return "UPDATING"
    case "WAITING_USER_INPUT":
    case "CREATED":
      return "PENDING"
    case "LOGIN_ERROR":
      return "LOGIN_ERROR"
    default:
      return "ERROR"
  }
}

interface PluggyItem {
  id: string
  status: string
  statusDetail?: unknown
  executionStatus?: string
  connector?: { id?: number; name?: string }
  error?: { message?: string } | null
}

interface PluggyAccount {
  id: string
  type?: string
  subtype?: string
  name?: string
  marketingName?: string
  number?: string
  balance?: number
  currencyCode?: string
}

interface PluggyTransaction {
  id: string
  description?: string
  descriptionRaw?: string
  amount: number
  amountInAccountCurrency?: number
  currencyCode?: string
  date: string
  category?: string | null
  status?: string
  type?: "DEBIT" | "CREDIT"
}

interface Paged<T> {
  results: T[]
  page: number
  totalPages: number
}

export class PluggyProvider implements OpenFinanceProvider {
  readonly name = "pluggy"
  #baseUrl = process.env.PLUGGY_BASE_URL ?? "https://api.pluggy.ai"
  #apiKey: string | null = null
  #apiKeyExpiresAt = 0

  async #auth(): Promise<string> {
    if (this.#apiKey && Date.now() < this.#apiKeyExpiresAt) return this.#apiKey
    const { apiKey } = await httpJson<{ apiKey: string }>(
      `${this.#baseUrl}/auth`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: requireEnv("PLUGGY_CLIENT_ID"),
          clientSecret: requireEnv("PLUGGY_CLIENT_SECRET"),
        }),
        retries: 1,
      }
    )
    this.#apiKey = apiKey
    // apiKey da Pluggy vale ~2h; renova bem antes para não estourar no meio do sync
    this.#apiKeyExpiresAt = Date.now() + 90 * 60 * 1000
    return apiKey
  }

  async #req<T>(path: string, init?: RequestInit & { timeoutMs?: number }) {
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

  #mapItem(item: PluggyItem): ProviderConnection {
    return {
      providerItemId: item.id,
      connectorId: item.connector?.id != null ? String(item.connector.id) : null,
      connectorName: item.connector?.name ?? null,
      status: mapStatus(item.status),
      statusDetail:
        item.error?.message ??
        (typeof item.statusDetail === "string" ? item.statusDetail : null),
      raw: item,
    }
  }

  async createConnection(
    input: CreateConnectionInput
  ): Promise<ProviderConnection> {
    // Fluxo recomendado: o widget Pluggy Connect cria o item no front e nos
    // manda só o id. Aqui apenas registramos e sincronizamos.
    if (input.itemId) return this.getConnection(input.itemId)

    // Fluxo alternativo (sandbox / testes): cria o item pelo backend.
    const connectorId = Number(
      input.connectorId ?? process.env.OPEN_FINANCE_DEFAULT_CONNECTOR_ID
    )
    if (!Number.isFinite(connectorId)) {
      throw new Error(
        "Informe itemId (widget) ou connectorId / OPEN_FINANCE_DEFAULT_CONNECTOR_ID"
      )
    }
    const item = await this.#req<PluggyItem>("/items", {
      method: "POST",
      body: JSON.stringify({
        connectorId,
        parameters: input.parameters ?? {},
      }),
    })
    return this.#mapItem(item)
  }

  async getConnection(providerItemId: string): Promise<ProviderConnection> {
    const item = await this.#req<PluggyItem>(
      `/items/${encodeURIComponent(providerItemId)}`
    )
    return this.#mapItem(item)
  }

  async deleteConnection(providerItemId: string): Promise<void> {
    await this.#req(`/items/${encodeURIComponent(providerItemId)}`, {
      method: "DELETE",
    })
  }

  async triggerSync(providerItemId: string): Promise<void> {
    // PATCH sem credenciais reexecuta a coleta do item já conectado.
    await this.#req(`/items/${encodeURIComponent(providerItemId)}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    })
  }

  async listAccounts(providerItemId: string): Promise<ProviderAccount[]> {
    const { results } = await this.#req<Paged<PluggyAccount>>(
      `/accounts?itemId=${encodeURIComponent(providerItemId)}`
    )
    return results.map((acc) => ({
      providerAccountId: acc.id,
      type: acc.subtype ?? acc.type ?? null,
      name: acc.name ?? acc.marketingName ?? null,
      number: acc.number ?? null,
      balance: acc.balance ?? null,
      currencyCode: acc.currencyCode ?? "BRL",
      raw: acc,
    }))
  }

  async listTransactions(
    providerAccountId: string,
    opts: ListTransactionsOptions = {}
  ): Promise<ProviderTransaction[]> {
    const all: ProviderTransaction[] = []
    let page = 1
    let totalPages = 1

    do {
      const params = new URLSearchParams({
        accountId: providerAccountId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      if (opts.from) params.set("from", opts.from)
      if (opts.to) params.set("to", opts.to)

      const res = await this.#req<Paged<PluggyTransaction>>(
        `/transactions?${params}`,
        { signal: opts.signal }
      )
      totalPages = res.totalPages || 1
      for (const tx of res.results) all.push(this.#mapTransaction(tx))
      page++
    } while (page <= totalPages && page <= MAX_PAGES)

    return all
  }

  #mapTransaction(tx: PluggyTransaction): ProviderTransaction {
    // A Pluggy pode devolver `amount` já com sinal ou sempre positivo + `type`.
    // Normalizamos para: negativo = saída, positivo = entrada.
    const raw = Number(tx.amount)
    let signed = raw
    if (tx.type === "DEBIT") signed = -Math.abs(raw)
    else if (tx.type === "CREDIT") signed = Math.abs(raw)

    return {
      providerTransactionId: tx.id,
      description: tx.description ?? tx.descriptionRaw ?? "Sem descrição",
      amount: signed,
      currencyCode: tx.currencyCode ?? "BRL",
      date: tx.date,
      status: tx.status ?? null,
      category: tx.category ?? null,
      raw: tx,
    }
  }

  parseWebhook(payload: unknown): WebhookEvent {
    const body = (payload ?? {}) as {
      event?: string
      itemId?: string
      id?: string
    }
    return {
      providerItemId: body.itemId ?? body.id ?? null,
      event: body.event ?? "unknown",
      raw: payload,
    }
  }
}
