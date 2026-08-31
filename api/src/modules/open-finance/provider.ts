import type {
  CreateConnectionInput,
  ListTransactionsOptions,
  ProviderAccount,
  ProviderConnection,
  ProviderTransaction,
  WebhookEvent,
} from "./types"

/**
 * Contrato de provedor de Open Finance. Trocar Pluggy por Belvo (ou outro) é
 * implementar esta interface e registrá-la em `getProvider()`.
 * Todos os métodos são somente leitura — não há pagamento nem iniciação.
 */
export interface OpenFinanceProvider {
  readonly name: string
  /** Registra/valida uma conexão no provedor e devolve seu estado atual. */
  createConnection(input: CreateConnectionInput): Promise<ProviderConnection>
  /** Estado atual da conexão ("item") no provedor. */
  getConnection(providerItemId: string): Promise<ProviderConnection>
  /** Desconecta a conexão no provedor. */
  deleteConnection(providerItemId: string): Promise<void>
  /** Pede ao provedor uma nova coleta de dados da conexão. */
  triggerSync(providerItemId: string): Promise<void>
  listAccounts(providerItemId: string): Promise<ProviderAccount[]>
  listTransactions(
    providerAccountId: string,
    opts?: ListTransactionsOptions
  ): Promise<ProviderTransaction[]>
  /** Extrai item e evento de um payload de webhook do provedor. */
  parseWebhook(payload: unknown): WebhookEvent
}

let cached: OpenFinanceProvider | null = null

export async function getProvider(): Promise<OpenFinanceProvider> {
  if (cached) return cached
  const name = (process.env.OPEN_FINANCE_PROVIDER ?? "pluggy").toLowerCase()
  switch (name) {
    case "pluggy": {
      const { PluggyProvider } = await import("./providers/pluggy")
      cached = new PluggyProvider()
      break
    }
    case "mock": {
      const { MockProvider } = await import("./providers/mock")
      cached = new MockProvider()
      break
    }
    default:
      throw new Error(
        `OPEN_FINANCE_PROVIDER inválido: "${name}" (use "pluggy" ou "mock")`
      )
  }
  return cached
}

/** Usado só em testes para injetar um provedor fake. */
export function __setProvider(p: OpenFinanceProvider | null) {
  cached = p
}
