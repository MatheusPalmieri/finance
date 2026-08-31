// Testa o ciclo de sincronização usando o MockProvider e o planejador puro,
// sem tocar no banco. Simula um "estado do banco" com um Set de ids.

import { beforeEach, describe, expect, it } from "bun:test"
import { MockProvider } from "./providers/mock"
import { planSync } from "./normalize"

describe("sincronização (MockProvider + planSync)", () => {
  let provider: MockProvider

  beforeEach(() => {
    provider = new MockProvider()
  })

  it("primeira sync insere tudo; segunda sync sem novidade só atualiza", async () => {
    const conn = await provider.createConnection({})
    const accounts = await provider.listAccounts(conn.providerItemId)
    expect(accounts).toHaveLength(1)

    const acc = accounts[0]!
    const stored = new Set<string>()

    // Sync 1
    let txs = await provider.listTransactions(acc.providerAccountId)
    let plan = planSync(txs, stored)
    expect(plan.toInsert).toHaveLength(3)
    expect(plan.toUpdate).toHaveLength(0)
    for (const n of plan.toInsert) stored.add(n.providerTransactionId)

    // Sync 2 (nada mudou no provedor)
    txs = await provider.listTransactions(acc.providerAccountId)
    plan = planSync(txs, stored)
    expect(plan.toInsert).toHaveLength(0)
    expect(plan.toUpdate).toHaveLength(3)
  })

  it("novas transações no provedor após triggerSync entram como insert", async () => {
    const conn = await provider.createConnection({})
    const acc = (await provider.listAccounts(conn.providerItemId))[0]!
    const stored = new Set<string>()

    for (const n of planSync(
      await provider.listTransactions(acc.providerAccountId),
      stored
    ).toInsert) {
      stored.add(n.providerTransactionId)
    }

    await provider.triggerSync(conn.providerItemId)

    const plan = planSync(
      await provider.listTransactions(acc.providerAccountId),
      stored
    )
    expect(plan.toInsert).toHaveLength(1)
    expect(plan.toInsert[0]!.providerTransactionId).toContain("extra-1")
  })

  it("parseWebhook extrai item e evento", () => {
    const ev = provider.parseWebhook({ event: "transactions/created", itemId: "x" })
    expect(ev.providerItemId).toBe("x")
    expect(ev.event).toBe("transactions/created")
  })
})
