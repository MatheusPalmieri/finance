// Provedor Pluggy (https://docs.pluggy.ai). Somente leitura: itens, contas e
// transações. Toda chamada sai do backend com o header `X-API-KEY` de curta
// duração derivado de CLIENT_ID/CLIENT_SECRET — nada disso vai para o frontend.
//
// Endpoints usados (verificados na doc em 2026-08):
//   POST   /auth                       -> { apiKey }
//   GET    /items/{id}                 -> Item
//   POST   /items                      -> Item   (fluxo sandbox/backend)
//   PATCH  /items/{id}                 -> Item   (reexecuta a coleta)
//   DELETE /items/{id}
//   GET    /accounts?itemId=&page=     -> { results, page, totalPages }
//   GET    /v2/transactions?accountId=&dateFrom=&dateTo=&after=  -> { results, next }
//     (o antigo GET /transactions por página foi descontinuado; /v2 usa cursor
//      via query param `after`, page size fixo de 500, cursor em `next`.
//      Filtro de data: `dateFrom`/`dateTo` no formato yyyy-mm-dd. NÃO aceita
//      `from`/`to` nem `pageSize`.)

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

// Teto de segurança para não paginar indefinidamente (500 itens/página).
const MAX_TX_PAGES = 60
const MAX_ACCOUNT_PAGES = 20

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${key}`)
  return value
}

// Item.status da Pluggy (doc "Item lifecycle") -> status agnóstico do projeto.
// Valores possíveis: UPDATING | LOGIN_ERROR | OUTDATED | WAITING_USER_INPUT | UPDATED
function mapStatus(
  status: string | undefined,
  executionStatus: string | undefined
): OpenFinanceConnectionStatus {
  switch (status) {
    case "UPDATED":
      return "ACTIVE"
    case "UPDATING":
      return "UPDATING"
    case "WAITING_USER_INPUT":
      return "PENDING"
    case "LOGIN_ERROR":
      return "LOGIN_ERROR"
    case "OUTDATED":
      return "ERROR"
    default:
      // Sem status conhecido: usa o executionStatus como pista de progresso.
      if (executionStatus && executionStatus.endsWith("_IN_PROGRESS")) {
        return "UPDATING"
      }
      if (executionStatus === "CREATED") return "PENDING"
      return "ERROR"
  }
}

interface PluggyItem {
  id: string
  status?: string
  executionStatus?: string
  statusDetail?: unknown
  connector?: { id?: number; name?: string }
  error?: { message?: string; code?: string } | null
}

interface PluggyAccount {
  id: string
  type?: string // BANK | CREDIT
  subtype?: string // CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD
  name?: string
  marketingName?: string
  number?: string
  balance?: number
  currencyCode?: string
}

interface PluggyPagedAccounts {
  results: PluggyAccount[]
  page?: number
  totalPages?: number
}

interface PluggyTransaction {
  id: string
  description?: string
  descriptionRaw?: string | null
  currencyCode?: string
  amount: number
  date: string
  category?: string | null
  status?: "PENDING" | "POSTED" | string
  type?: "DEBIT" | "CREDIT"
}

// GET /v2/transactions: paginação por cursor. `next` vem como querystring
// pronta (ex.: "?accountId=...&after=<cursor>") ou ausente/null na última página.
interface PluggyV2Transactions {
  results: PluggyTransaction[]
  next?: string | null
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
    const detail =
      item.error?.message ??
      (typeof item.statusDetail === "string" ? item.statusDetail : null)
    return {
      providerItemId: item.id,
      connectorId:
        item.connector?.id != null ? String(item.connector.id) : null,
      connectorName: item.connector?.name ?? null,
      status: mapStatus(item.status, item.executionStatus),
      statusDetail: detail,
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
    const body: Record<string, unknown> = {
      connectorId,
      parameters: input.parameters ?? {},
      // Não recria o item se já existir um com as mesmas credenciais.
      avoidDuplicates: true,
    }
    const webhookUrl = process.env.OPEN_FINANCE_WEBHOOK_URL
    if (webhookUrl) body.webhookUrl = webhookUrl

    const item = await this.#req<PluggyItem>("/items", {
      method: "POST",
      body: JSON.stringify(body),
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
    // PATCH com corpo vazio reexecuta a coleta usando as credenciais já armazenadas.
    await this.#req(`/items/${encodeURIComponent(providerItemId)}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    })
  }

  async listAccounts(providerItemId: string): Promise<ProviderAccount[]> {
    const out: ProviderAccount[] = []
    let page = 1
    let totalPages = 1

    do {
      const res = await this.#req<PluggyPagedAccounts>(
        `/accounts?itemId=${encodeURIComponent(providerItemId)}&page=${page}`
      )
      totalPages = res.totalPages ?? 1
      for (const acc of res.results) {
        out.push({
          providerAccountId: acc.id,
          type: acc.subtype ?? acc.type ?? null,
          name: acc.name ?? acc.marketingName ?? null,
          number: acc.number ?? null,
          balance: acc.balance ?? null,
          currencyCode: acc.currencyCode ?? "BRL",
          raw: acc,
        })
      }
      page++
    } while (page <= totalPages && page <= MAX_ACCOUNT_PAGES)

    return out
  }

  async listTransactions(
    providerAccountId: string,
    opts: ListTransactionsOptions = {}
  ): Promise<ProviderTransaction[]> {
    const all: ProviderTransaction[] = []
    let after: string | null = null
    let pages = 0

    do {
      const params = new URLSearchParams({ accountId: providerAccountId })
      if (opts.from) params.set("dateFrom", opts.from)
      if (opts.to) params.set("dateTo", opts.to)
      if (after) params.set("after", after)

      const res = await this.#req<PluggyV2Transactions>(
        `/v2/transactions?${params}`,
        { signal: opts.signal }
      )
      for (const tx of res.results) all.push(this.#mapTransaction(tx))

      after = extractAfterCursor(res.next)
      pages++
    } while (after && pages < MAX_TX_PAGES)

    return all
  }

  #mapTransaction(tx: PluggyTransaction): ProviderTransaction {
    // A direção vem do campo `type`; o sinal de `amount` varia por conector,
    // então derivamos o sinal do tipo quando ele existe.
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
    // Payload padrão da Pluggy: { event, eventId, itemId, accountId?, ... }
    const body = (payload ?? {}) as { event?: string; itemId?: string }
    return {
      providerItemId: body.itemId ?? null,
      event: body.event ?? "unknown",
      raw: payload,
    }
  }
}

// `next` vem como "?accountId=...&after=<cursor>" (ou null na última página).
function extractAfterCursor(next: string | null | undefined): string | null {
  if (!next) return null
  const qs = next.includes("?") ? next.slice(next.indexOf("?") + 1) : next
  return new URLSearchParams(qs).get("after")
}
