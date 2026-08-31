// Tipos agnósticos de provedor. Nenhum campo aqui carrega credencial bancária,
// senha ou token — só identificadores e metadados públicos da conexão.

export type OpenFinanceConnectionStatus =
  | "PENDING"
  | "UPDATING"
  | "ACTIVE"
  | "LOGIN_ERROR"
  | "ERROR"
  | "DELETED"

export interface ProviderConnection {
  /** Identificador da conexão ("item") no provedor. */
  providerItemId: string
  connectorId?: string | null
  connectorName?: string | null
  status: OpenFinanceConnectionStatus
  statusDetail?: string | null
  /** Metadados do item, sem credenciais — guardado para auditoria. */
  raw: unknown
}

export interface ProviderAccount {
  providerAccountId: string
  type?: string | null
  name?: string | null
  /** Número já mascarado pelo provedor, quando houver. */
  number?: string | null
  balance?: number | null
  currencyCode?: string | null
  raw: unknown
}

export interface ProviderTransaction {
  providerTransactionId: string
  description: string
  /**
   * Valor na convenção do provedor: negativo = saída (débito),
   * positivo = entrada (crédito). A normalização inverte o sinal para o
   * modelo do projeto (positivo = despesa).
   */
  amount: number
  currencyCode?: string | null
  /** Data ISO — dia ou datetime; a normalização reduz para YYYY-MM-DD. */
  date: string
  /** Status preservado da origem (ex.: Pluggy "POSTED" | "PENDING"). */
  status?: string | null
  category?: string | null
  raw: unknown
}

export interface ListTransactionsOptions {
  /** Limite inferior de data (YYYY-MM-DD) para sincronização incremental. */
  from?: string
  to?: string
  signal?: AbortSignal
}

export interface WebhookEvent {
  providerItemId: string | null
  event: string
  raw: unknown
}

export interface CreateConnectionInput {
  /**
   * Quando o widget do provedor já criou o item no front, passamos só o id
   * e o backend apenas o registra + sincroniza.
   */
  itemId?: string
  /** Conector a usar quando criando a conexão pelo backend (sandbox). */
  connectorId?: string
  /**
   * Parâmetros do conector (ex.: credenciais de sandbox `user`/`password`).
   * Nunca são persistidos — vão direto para o provedor e são descartados.
   */
  parameters?: Record<string, string>
}
