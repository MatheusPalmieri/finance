// E2E da spec 04 — motor de sync do Open Finance contra o banco de teste,
// com o provedor em memória (sem rede).

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { db } from "../db"
import {
  accounts,
  openFinanceSnapshots,
  pluggyAccounts,
  pluggyItems,
  pluggyTransactions,
  syncRuns,
  transactions,
} from "../db/schema"
import { seedClassificationRules } from "../db/seed-rules"
import { __setProvider } from "../modules/open-finance/provider"
import { MockOpenFinanceProvider } from "../test/mocks/open-finance"
import { refreshTiming, runSync, SyncBusyError } from "../modules/open-finance/sync"
import type { ProviderTransaction } from "../modules/open-finance/types"
import { makeAccount, makeCategory, resetDatabase } from "../test/helpers"

let provider: MockOpenFinanceProvider

/** ISO de N dias atrás às 15h UTC (12h em Brasília). */
function daysAgo(days: number, hourUtc = 15): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  d.setUTCHours(hourUtc, 0, 0, 0)
  return d.toISOString()
}

function localDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}

function bankTx(partial: Partial<ProviderTransaction> & { id: string }): ProviderTransaction {
  return { date: daysAgo(3), amount: -50, type: "DEBIT", status: "POSTED", description: "Algo", ...partial }
}

async function seedCatalog() {
  for (const name of ["Outros", "Alimentação", "Moradia", "Investimento", "Transporte", "Saúde"]) {
    await makeCategory(name)
  }
}

function setupNubank() {
  provider.accounts = [
    { id: "acc-bank", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Conta", number: "123" },
    { id: "acc-card", type: "CREDIT", subtype: "CREDIT_CARD", name: "Platinum", number: "3962" },
  ]
  provider.transactions = {
    "acc-bank": [
      bankTx({ id: "b1", description: "Transferência enviada|Padaria do Zé", amount: -32.5 }),
      bankTx({ id: "b2", description: "Transferência Recebida|EMPRESA LTDA", amount: 5000, type: "CREDIT", categoryId: "05000000" }),
      bankTx({ id: "b3", description: "Pagamento de fatura", amount: -900, categoryId: "05000000" }),
      bankTx({ id: "b4", description: "Aplicação RDB", amount: -200, categoryId: "03000000" }),
      bankTx({ id: "b5", description: "Pagamento de boleto efetuado|CELESC DISTRIBUICAO", amount: -180, paymentData: { paymentMethod: "BOLETO" } }),
    ],
    "acc-card": [
      bankTx({ id: "c1", description: "Ifood", amount: 45.9, type: "DEBIT", categoryId: "11020000" }),
      bankTx({ id: "c2", description: "Pagamento recebido", amount: -900, type: "CREDIT", categoryId: "05100000" }),
      bankTx({
        id: "c3",
        description: "Academia 12/12",
        amount: 78.75,
        type: "DEBIT",
        status: "PENDING",
        date: new Date(Date.now() + 200 * 86_400_000).toISOString(),
        categoryId: "07030000",
      }),
    ],
  }
}

beforeEach(async () => {
  await resetDatabase()
  provider = new MockOpenFinanceProvider()
  __setProvider(provider)
  await seedCatalog()
})
afterEach(() => __setProvider(null))

describe("e2e sync — primeira sincronização", () => {
  test("vincula as contas, grava tudo normalizado e classifica", async () => {
    const nubank = await makeAccount("Nubank")
    await seedClassificationRules()
    setupNubank()

    const report = await runSync({ trigger: "cli" })
    expect(report.full).toBe(true)
    expect(report.fetched).toBe(8)
    expect(report.created).toBe(8)

    // Conta corrente reaproveita "Nubank"; o cartão ganha conta própria
    const links = await db.select().from(pluggyAccounts)
    expect(links.find((l) => l.providerAccountId === "acc-bank")!.accountId).toBe(nubank.id)
    const [card] = await db.select().from(accounts).where(eq(accounts.name, "Nubank Cartão"))
    expect(card.type).toBe("CREDIT_CARD")

    const rows = await db.query.transactions.findMany({ with: { category: true } })
    const byExternal = new Map(rows.map((r) => [r.externalId, r]))

    const pix = byExternal.get("b1")!
    expect(pix.name).toBe("Pix para Padaria do Zé")
    expect(pix.amount).toBe("32.50")
    expect(pix.source).toBe("open_finance")
    expect(pix.date).toBe(localDay(daysAgo(3)))

    // Regra de salário do seed reconhece o formato convertido do texto da Pluggy
    const salary = byExternal.get("b2")!
    expect(salary.amount).toBe("-5000.00")
    expect(salary.kind).toBe("regular")
    expect(salary.isEssential).toBe(false)

    expect(byExternal.get("b3")!.kind).toBe("bill_payment")
    expect(byExternal.get("c2")!.kind).toBe("bill_payment")
    expect(byExternal.get("b4")!.kind).toBe("investment")
    expect(byExternal.get("b5")!.name).toBe("Conta de luz") // regra "celesc distribuicao"
    expect(byExternal.get("b5")!.paymentMethod).toBe("boleto")

    const ifood = byExternal.get("c1")!
    expect(ifood.paymentMethod).toBe("credit_card")
    expect(ifood.accountId).toBe(card.id)
    // Nenhuma regra/histórico: cai no mapeamento da categoria da Pluggy
    expect(ifood.category?.name).toBe("Alimentação")

    const installment = byExternal.get("c3")!
    expect(installment.status).toBe("pending")
    expect(installment.category?.name).toBe("Saúde")

    expect(await db.select().from(pluggyTransactions)).toHaveLength(8)
    const [item] = await db.select().from(pluggyItems)
    expect(item.lastSyncedAt).not.toBeNull()
    expect(item.lastFullSyncAt).not.toBeNull()
    const [run] = await db.select().from(syncRuns)
    expect(run.status).toBe("success")
    expect(run.created).toBe(8)
  })

  test("grava o retrato de saldos com as contas que já buscou", async () => {
    setupNubank()
    await runSync({ trigger: "cli" })
    const [snapshot] = await db.select().from(openFinanceSnapshots)
    expect(snapshot.kind).toBe("balances")
    expect((snapshot.payload as { accounts: unknown[] }).accounts).toHaveLength(2)
  })

  test("dry-run não grava retrato", async () => {
    setupNubank()
    await runSync({ trigger: "cli", dryRun: true })
    expect(await db.select().from(openFinanceSnapshots)).toHaveLength(0)
  })
})

describe("e2e sync — sincronizações seguintes", () => {
  test("é idempotente", async () => {
    setupNubank()
    await runSync({ trigger: "cli" })
    const second = await runSync({ trigger: "cli" })
    expect(second.created).toBe(0)
    expect(second.updated).toBe(0)
    expect(second.unchanged).toBe(8)
    expect(await db.select().from(transactions)).toHaveLength(8)
  })

  test("o incremental pede só a janela recente", async () => {
    setupNubank()
    await runSync({ trigger: "cli" })
    provider.requestedFrom = []
    const second = await runSync({ trigger: "cli" })
    expect(second.full).toBe(false)
    const expected = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
    expect(provider.requestedFrom.every((from) => from === expected)).toBe(true)
  })

  test("transação da madrugada na borda da janela incremental não duplica", async () => {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
    // 01h UTC do 1º dia da janela = 22h do dia anterior em Brasília
    provider.accounts = [{ id: "acc-bank", type: "BANK", name: "Conta" }]
    provider.transactions = { "acc-bank": [bankTx({ id: "edge", amount: -12, date: `${from}T01:00:00.000Z` })] }
    await runSync({ trigger: "cli" })
    const second = await runSync({ trigger: "cli" })
    expect(second.full).toBe(false)
    expect(second.unchanged).toBe(1)
    expect(second.created).toBe(0)
    expect(await db.select().from(transactions)).toHaveLength(1)
  })

  test("atualiza o que é do banco e preserva o que o usuário editou", async () => {
    setupNubank()
    await runSync({ trigger: "cli" })
    const moradia = (await db.query.categories.findFirst({ where: (c, { eq }) => eq(c.name, "Moradia") }))!
    await db
      .update(transactions)
      .set({ name: "Pão", categoryId: moradia.id, isEssential: true, notes: "minha nota" })
      .where(eq(transactions.externalId, "b1"))

    provider.transactions["acc-bank"][0].amount = -35
    const report = await runSync({ trigger: "cli" })
    expect(report.updated).toBe(1)

    const [row] = await db.select().from(transactions).where(eq(transactions.externalId, "b1"))
    expect(row.amount).toBe("35.00")
    expect(row.name).toBe("Pão")
    expect(row.categoryId).toBe(moradia.id)
    expect(row.isEssential).toBe(true)
    expect(row.notes).toBe("minha nota")
  })

  test("id trocado no provedor (pendente → lançada) religa sem duplicar", async () => {
    setupNubank()
    await runSync({ trigger: "cli" })
    await db.update(transactions).set({ name: "Almoço" }).where(eq(transactions.externalId, "c1"))

    // A Pluggy apaga e recria com id novo quando a transação muda
    provider.transactions["acc-card"][0] = { ...provider.transactions["acc-card"][0], id: "c1-posted", date: daysAgo(2) }
    const report = await runSync({ trigger: "cli" })
    expect(report.created).toBe(0)
    expect(report.removed).toBe(0)
    expect(report.updated).toBe(1)

    const rows = await db.select().from(transactions).where(eq(transactions.name, "Almoço"))
    expect(rows).toHaveLength(1)
    expect(rows[0].externalId).toBe("c1-posted")
    expect(rows[0].date).toBe(localDay(daysAgo(2)))
  })

  test("o que sumiu do provedor é removido", async () => {
    setupNubank()
    await runSync({ trigger: "cli" })
    provider.transactions["acc-bank"] = provider.transactions["acc-bank"].filter((t) => t.id !== "b4")
    const report = await runSync({ trigger: "cli" })
    expect(report.removed).toBe(1)
    expect(await db.select().from(transactions).where(eq(transactions.externalId, "b4"))).toHaveLength(0)
    expect(await db.select().from(transactions)).toHaveLength(7)
  })

  test("conta devolvida vazia não apaga nada (falha provável do provedor)", async () => {
    setupNubank()
    await runSync({ trigger: "cli" })
    provider.transactions["acc-bank"] = []
    const report = await runSync({ trigger: "cli", full: true })
    expect(report.removed).toBe(0)
    expect(await db.select().from(transactions)).toHaveLength(8)
  })
})

describe("e2e sync — dry-run e falhas", () => {
  test("dry-run relata tudo e não grava nada", async () => {
    await makeAccount("Nubank")
    setupNubank()
    const report = await runSync({ trigger: "cli", dryRun: true })
    expect(report.dryRun).toBe(true)
    expect(report.created).toBe(8)
    expect(report.runId).toBeNull()
    expect(await db.select().from(transactions)).toHaveLength(0)
    expect(await db.select().from(pluggyAccounts)).toHaveLength(0)
    expect(await db.select().from(accounts).where(eq(accounts.name, "Nubank Cartão"))).toHaveLength(0)
    expect(await db.select().from(syncRuns)).toHaveLength(0)
  })

  test("falha do provedor fica registrada no sync_run e não grava nada", async () => {
    setupNubank()
    provider.failWith = new Error("Pluggy fora do ar")
    await expect(runSync({ trigger: "manual" })).rejects.toThrow("Pluggy fora do ar")
    const [run] = await db.select().from(syncRuns)
    expect(run.status).toBe("error")
    expect(run.errorMessage).toContain("Pluggy fora do ar")
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  test("chamadas simultâneas compartilham o mesmo sync", async () => {
    setupNubank()
    const [a, b] = await Promise.all([runSync({ trigger: "manual" }), runSync({ trigger: "stale" })])
    expect(a).toBe(b)
    expect(await db.select().from(syncRuns)).toHaveLength(1)
    expect(SyncBusyError).toBeDefined()
  })

  test("refresh pede nova coleta ao banco antes de ler", async () => {
    setupNubank()
    refreshTiming.pollMs = 1
    await runSync({ trigger: "manual", refresh: true })
    refreshTiming.pollMs = 3_000
    expect(provider.refreshCalls).toBe(1)
  })
})
