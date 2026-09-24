// E2E da spec 04 — rotas /open-finance (status, sync, histórico, vínculo).

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { pluggyItems, syncRuns, transactions } from "../db/schema"
import { __setProvider } from "../modules/open-finance/provider"
import { MockOpenFinanceProvider } from "../test/mocks/open-finance"
import { isSyncRunning, runSync } from "../modules/open-finance/sync"
import { api, makeAccount, makeCategory, resetDatabase } from "../test/helpers"

type StatusBody = {
  configured: boolean
  running: boolean
  stale: boolean
  startedBackgroundSync: boolean
  lastSyncedAt: string | null
  accounts: { id: string; providerAccountId: string; accountId: string; accountName: string }[]
  lastRun: { status: string; created: number } | null
}

let provider: MockOpenFinanceProvider

function setup() {
  provider.accounts = [
    { id: "acc-bank", type: "BANK", name: "Conta" },
    { id: "acc-card", type: "CREDIT", name: "Cartão" },
  ]
  const date = new Date(Date.now() - 2 * 86_400_000).toISOString()
  provider.transactions = {
    "acc-bank": [{ id: "b1", date, amount: -10, type: "DEBIT", description: "Padaria" }],
    "acc-card": [{ id: "c1", date, amount: 20, type: "DEBIT", description: "Mercado" }],
  }
}

/** Espera o sync em segundo plano terminar. */
async function waitIdle() {
  for (let i = 0; i < 200 && isSyncRunning(); i++) await new Promise((r) => setTimeout(r, 10))
}

beforeEach(async () => {
  await resetDatabase()
  await makeCategory("Outros")
  provider = new MockOpenFinanceProvider()
})
afterEach(async () => {
  await waitIdle()
  __setProvider(null)
})

describe("e2e /open-finance — sem configuração", () => {
  test("status diz que não está configurado e não dispara nada", async () => {
    const res = await api.get<StatusBody>("/open-finance/status")
    expect(res.status).toBe(200)
    expect(res.body.configured).toBe(false)
    expect(res.body.stale).toBe(false)
    expect(res.body.startedBackgroundSync).toBe(false)
  })

  test("POST /sync responde 400", async () => {
    const res = await api.post<{ message: string }>("/open-finance/sync", {})
    expect(res.status).toBe(400)
    expect(res.body.message).toContain("PLUGGY_")
  })
})

describe("e2e /open-finance — configurado", () => {
  beforeEach(() => {
    __setProvider(provider)
    setup()
  })

  test("status com dados velhos dispara o sync em segundo plano", async () => {
    const res = await api.get<StatusBody>("/open-finance/status")
    expect(res.body.configured).toBe(true)
    expect(res.body.stale).toBe(true)
    expect(res.body.startedBackgroundSync).toBe(true)
    await waitIdle()

    const after = await api.get<StatusBody>("/open-finance/status")
    expect(after.body.stale).toBe(false)
    expect(after.body.startedBackgroundSync).toBe(false)
    expect(after.body.lastRun?.status).toBe("success")
    expect(after.body.accounts).toHaveLength(2)
    const [run] = await db.select().from(syncRuns)
    expect(run.trigger).toBe("stale")
  })

  test("autoSync=false só consulta", async () => {
    const res = await api.get<StatusBody>("/open-finance/status?autoSync=false")
    expect(res.body.stale).toBe(true)
    expect(res.body.startedBackgroundSync).toBe(false)
    expect(await db.select().from(syncRuns)).toHaveLength(0)
  })

  test("sync recente não dispara de novo", async () => {
    await runSync({ trigger: "cli" })
    const res = await api.get<StatusBody>("/open-finance/status")
    expect(res.body.stale).toBe(false)
    expect(res.body.startedBackgroundSync).toBe(false)
  })

  test("dados de mais de 6h voltam a ficar velhos", async () => {
    await runSync({ trigger: "cli" })
    await db.update(pluggyItems).set({ lastSyncedAt: new Date(Date.now() - 7 * 3600_000) })
    const res = await api.get<StatusBody>("/open-finance/status?autoSync=false")
    expect(res.body.stale).toBe(true)
  })

  test("POST /sync roda em segundo plano (202)", async () => {
    const res = await api.post<{ started: boolean }>("/open-finance/sync", { full: true })
    expect(res.status).toBe(202)
    expect(res.body.started).toBe(true)
    await waitIdle()
    expect(await db.select().from(transactions)).toHaveLength(2)
    const runs = await api.get<{ trigger: string; status: string; full: boolean }[]>("/open-finance/runs")
    expect(runs.body[0]).toMatchObject({ trigger: "manual", status: "success", full: true })
  })

  test("POST /sync com dryRun devolve o relatório e não grava", async () => {
    const res = await api.post<{ dryRun: boolean; created: number }>("/open-finance/sync", { dryRun: true })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ dryRun: true, created: 2 })
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  test("falha do provedor aparece no lastRun", async () => {
    provider.failWith = new Error("Pluggy fora do ar")
    await api.post("/open-finance/sync", {})
    await waitIdle()
    const res = await api.get<StatusBody & { lastRun: { status: string; errorMessage: string } }>(
      "/open-finance/status?autoSync=false"
    )
    expect(res.body.lastRun).toMatchObject({ status: "error", errorMessage: "Pluggy fora do ar" })
  })

  test("PATCH /accounts/:id troca o vínculo e leva as transações junto", async () => {
    await runSync({ trigger: "cli" })
    const outra = await makeAccount("Outra conta")
    const status = await api.get<StatusBody>("/open-finance/status?autoSync=false")
    const bank = status.body.accounts.find((a) => a.providerAccountId === "acc-bank")!

    const res = await api.patch<{ movedTransactions: number }>(`/open-finance/accounts/${bank.id}`, {
      accountId: outra.id,
    })
    expect(res.status).toBe(200)
    expect(res.body.movedTransactions).toBe(1)
    const [row] = await db.select().from(transactions).where(eq(transactions.externalId, "b1"))
    expect(row.accountId).toBe(outra.id)

    // O próximo sync respeita o vínculo novo
    const report = await runSync({ trigger: "cli" })
    expect(report.created).toBe(0)
  })

  test("não vincula a uma conta inexistente", async () => {
    await runSync({ trigger: "cli" })
    const status = await api.get<StatusBody>("/open-finance/status?autoSync=false")
    const bank = status.body.accounts[0]
    const res = await api.patch(`/open-finance/accounts/${bank.id}`, {
      accountId: "00000000-0000-0000-0000-000000000000",
    })
    expect(res.status).toBe(400)
  })
})
