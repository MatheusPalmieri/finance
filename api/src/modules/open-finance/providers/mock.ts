// Provedor fake — dados determinísticos, sem rede. Ativado com
// OPEN_FINANCE_PROVIDER=mock. Serve para desenvolver o fluxo local sem
// credenciais de sandbox e para os testes de sincronização.

import type { OpenFinanceProvider } from "../provider"
import type {
  CreateConnectionInput,
  ListTransactionsOptions,
  ProviderAccount,
  ProviderConnection,
  ProviderTransaction,
  WebhookEvent,
} from "../types"

const ITEM_ID = "mock-item-1"
const ACCOUNT_ID = "mock-account-1"

export class MockProvider implements OpenFinanceProvider {
  readonly name = "mock"
  /** Sobe a cada triggerSync para simular novas transações no provedor. */
  #extraTransactions = 0

  async createConnection(
    _input: CreateConnectionInput
  ): Promise<ProviderConnection> {
    return this.getConnection(ITEM_ID)
  }

  async getConnection(providerItemId: string): Promise<ProviderConnection> {
    return {
      providerItemId,
      connectorId: "0",
      connectorName: "Mock Bank",
      status: "ACTIVE",
      statusDetail: null,
      raw: { id: providerItemId, status: "UPDATED", connector: { name: "Mock Bank" } },
    }
  }

  async deleteConnection(_providerItemId: string): Promise<void> {}

  async triggerSync(_providerItemId: string): Promise<void> {
    this.#extraTransactions += 1
  }

  async listAccounts(providerItemId: string): Promise<ProviderAccount[]> {
    return [
      {
        providerAccountId: ACCOUNT_ID,
        type: "CHECKING",
        name: "Conta Corrente (mock)",
        number: "****1234",
        balance: 4200.55,
        currencyCode: "BRL",
        raw: { id: ACCOUNT_ID, itemId: providerItemId },
      },
    ]
  }

  async listTransactions(
    providerAccountId: string,
    _opts: ListTransactionsOptions = {}
  ): Promise<ProviderTransaction[]> {
    const base: ProviderTransaction[] = [
      {
        providerTransactionId: `${providerAccountId}-tx-1`,
        description: "Supermercado Pão de Açúcar",
        amount: -256.9,
        currencyCode: "BRL",
        date: "2026-08-01",
        status: "POSTED",
        category: "Supermercado",
        raw: { id: `${providerAccountId}-tx-1` },
      },
      {
        providerTransactionId: `${providerAccountId}-tx-2`,
        description: "Assinatura streaming",
        amount: -39.9,
        currencyCode: "BRL",
        date: "2026-08-05",
        status: "POSTED",
        category: "Serviços",
        raw: { id: `${providerAccountId}-tx-2` },
      },
      {
        providerTransactionId: `${providerAccountId}-tx-3`,
        description: "Pagamento recebido",
        amount: 1500,
        currencyCode: "BRL",
        date: "2026-08-06",
        status: "POSTED",
        category: "Transferência",
        raw: { id: `${providerAccountId}-tx-3` },
      },
    ]
    for (let i = 0; i < this.#extraTransactions; i++) {
      base.push({
        providerTransactionId: `${providerAccountId}-extra-${i + 1}`,
        description: `Compra avulsa ${i + 1}`,
        amount: -(10 + i),
        currencyCode: "BRL",
        date: "2026-08-10",
        status: "POSTED",
        category: "Outros",
        raw: { id: `${providerAccountId}-extra-${i + 1}` },
      })
    }
    return base
  }

  parseWebhook(payload: unknown): WebhookEvent {
    const body = (payload ?? {}) as { event?: string; itemId?: string }
    return {
      providerItemId: body.itemId ?? ITEM_ID,
      event: body.event ?? "item/updated",
      raw: payload,
    }
  }
}
