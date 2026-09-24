import type {
  ListTransactionsOptions,
  ProviderAccount,
  ProviderInvestment,
  ProviderInvestmentTransaction,
  ProviderItem,
  ProviderTransaction,
} from "./types"

/**
 * Contrato do provedor de Open Finance. Somente leitura, mais o pedido de
 * nova coleta (`refreshItem`). Trocar a Pluggy por outro agregador é
 * implementar esta interface.
 */
export interface OpenFinanceProvider {
  readonly name: string
  /** IDs das conexões configuradas (a Pluggy não deixa listar por segurança). */
  itemIds(): string[]
  getItem(itemId: string): Promise<ProviderItem>
  /** Pede ao banco uma nova coleta. Assíncrono do lado do provedor. */
  refreshItem(itemId: string): Promise<void>
  listAccounts(itemId: string): Promise<ProviderAccount[]>
  listTransactions(
    accountId: string,
    opts?: ListTransactionsOptions
  ): Promise<ProviderTransaction[]>
  listInvestments(itemId: string): Promise<ProviderInvestment[]>
  listInvestmentTransactions(
    investmentId: string
  ): Promise<ProviderInvestmentTransaction[]>
}

let cached: OpenFinanceProvider | null = null

/** `true` quando há credenciais — sem elas o app segue sem Open Finance. */
export function isConfigured(): boolean {
  if (cached) return true
  return Boolean(
    process.env.PLUGGY_CLIENT_ID?.trim() &&
      process.env.PLUGGY_CLIENT_SECRET?.trim() &&
      process.env.PLUGGY_ITEM_IDS?.trim()
  )
}

export async function getProvider(): Promise<OpenFinanceProvider> {
  if (cached) return cached
  const { PluggyProvider } = await import("./providers/pluggy")
  cached = new PluggyProvider()
  return cached
}

/** Só para testes: injeta o dublê (`src/test/mocks/open-finance.ts`) ou limpa com `null`. */
export function __setProvider(provider: OpenFinanceProvider | null) {
  cached = provider
}
