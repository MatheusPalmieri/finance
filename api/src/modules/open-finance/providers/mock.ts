// Provedor em memória para testes. O estado é público: o teste monta contas e
// transações, roda o sync, muda o estado e roda de novo.

import type { OpenFinanceProvider } from "../provider"
import type {
  ProviderAccount,
  ProviderInvestment,
  ProviderInvestmentTransaction,
  ProviderItem,
  ProviderTransaction,
} from "../types"

export class MockOpenFinanceProvider implements OpenFinanceProvider {
  readonly name = "mock"
  items: ProviderItem[] = [
    { id: "item-1", status: "UPDATED", executionStatus: "SUCCESS", connector: { id: 612, name: "Nubank" } },
  ]
  accounts: ProviderAccount[] = []
  /** accountId → transações */
  transactions: Record<string, ProviderTransaction[]> = {}
  investments: ProviderInvestment[] = []
  /** investmentId → movimentações */
  investmentTransactions: Record<string, ProviderInvestmentTransaction[]> = {}
  /** Falha forçada por método (simula a Pluggy fora do ar). */
  failWith: Error | null = null
  refreshCalls = 0
  /** Datas `from` pedidas em cada listTransactions — para testar a janela. */
  requestedFrom: (string | undefined)[] = []

  #check() {
    if (this.failWith) throw this.failWith
  }

  itemIds() {
    return this.items.map((item) => item.id)
  }

  async getItem(itemId: string) {
    this.#check()
    const item = this.items.find((i) => i.id === itemId)
    if (!item) throw new Error(`item ${itemId} não existe`)
    return item
  }

  async refreshItem() {
    this.#check()
    this.refreshCalls++
  }

  async listAccounts(itemId: string) {
    this.#check()
    return this.accounts.filter((a) => (a.itemId ?? "item-1") === itemId)
  }

  async listTransactions(accountId: string, opts: { from?: string } = {}) {
    this.#check()
    this.requestedFrom.push(opts.from)
    const all = this.transactions[accountId] ?? []
    // Mesma semântica do dateFrom da Pluggy (data em UTC)
    return opts.from ? all.filter((t) => t.date.slice(0, 10) >= opts.from!) : all
  }

  async listInvestments() {
    this.#check()
    return this.investments
  }

  async listInvestmentTransactions(investmentId: string) {
    this.#check()
    return this.investmentTransactions[investmentId] ?? []
  }
}
