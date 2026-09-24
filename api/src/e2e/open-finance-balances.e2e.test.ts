// E2E da spec 04 (F5) — saldos do Open Finance, o cache persistente no banco
// (`open_finance_snapshots`) e seu uso na projeção.

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { db } from "../db"
import { __setProvider } from "../modules/open-finance/provider"
import { __clearSnapshotInFlight } from "../modules/open-finance/snapshots"
import { MockOpenFinanceProvider } from "../test/mocks/open-finance"
import { runSync } from "../modules/open-finance/sync"
import type { CashflowProjection } from "../modules/forecast/types"
import { api, makeAccount, makeCategory, resetDatabase } from "../test/helpers"

type BalancesBody = {
  available: boolean
  source: "live" | "cache" | "none"
  stale: boolean
  error: string | null
  fetchedAt: string | null
  cash: number
  cardDebt: number
  accounts: { accountName: string; type: string; balance: number; creditLimit: number | null; dueDate: string | null }[]
}

let provider: MockOpenFinanceProvider

function setup() {
  provider.accounts = [
    { id: "acc-bank", type: "BANK", name: "Conta", balance: 1000 },
    {
      id: "acc-card",
      type: "CREDIT",
      name: "Cartão",
      balance: 500,
      creditData: { creditLimit: 5000, availableCreditLimit: 4500, balanceDueDate: "2026-10-08T00:00:00.000Z", minimumPayment: 75 },
    },
  ]
  const inFuture = new Date(Date.now() + 40 * 86_400_000).toISOString()
  provider.transactions = {
    "acc-bank": [],
    // A parcela futura está dentro dos R$ 500 usados do limite
    "acc-card": [{ id: "inst-2", date: inFuture, amount: 100, type: "DEBIT", status: "PENDING", description: "Loja 2/2" }],
  }
}

/** Envelhece o retrato gravado, simulando o prazo vencido. */
async function expireSnapshot(kind: "balances" | "investments") {
  await db.execute(
    sql`update open_finance_snapshots set fetched_at = now() - interval '2 hours' where kind = ${kind}`
  )
}

beforeEach(async () => {
  await resetDatabase()
  __clearSnapshotInFlight()
  await makeCategory("Outros")
  provider = new MockOpenFinanceProvider()
})
afterEach(() => {
  __setProvider(null)
  __clearSnapshotInFlight()
})

describe("e2e GET /open-finance/balances", () => {
  test("sem configuração e sem retrato: indisponível, nada inventado", async () => {
    const res = await api.get<BalancesBody>("/open-finance/balances")
    expect(res.body).toMatchObject({ available: false, source: "none", cash: 0, accounts: [] })
    expect(res.body.error).toContain("não configurado")
  })

  test("antes do primeiro sync: indisponível (não há vínculo de contas)", async () => {
    __setProvider(provider)
    setup()
    const res = await api.get<BalancesBody>("/open-finance/balances")
    expect(res.body.available).toBe(false)
  })

  test("o sync grava o retrato: saldo da conta, fatura e limite do cartão", async () => {
    __setProvider(provider)
    setup()
    await runSync({ trigger: "cli" })

    // O sync já trouxe as contas: a leitura não precisa ir à Pluggy
    provider.failWith = new Error("não deveria chamar")
    const res = await api.get<BalancesBody>("/open-finance/balances")
    expect(res.body).toMatchObject({ available: true, source: "cache", stale: false, cash: 1000, cardDebt: 500 })
    const card = res.body.accounts.find((a) => a.type === "CREDIT")!
    expect(card).toMatchObject({ accountName: "Nubank Cartão", creditLimit: 5000, dueDate: "2026-10-08" })
  })

  test("retrato dentro do prazo vem do banco; fresh=true busca e regrava", async () => {
    __setProvider(provider)
    setup()
    await runSync({ trigger: "cli" })

    provider.accounts[0].balance = 2000
    const cached = await api.get<BalancesBody>("/open-finance/balances")
    expect(cached.body.cash).toBe(1000)
    const fresh = await api.get<BalancesBody>("/open-finance/balances?fresh=true")
    expect(fresh.body).toMatchObject({ source: "live", cash: 2000 })
    const after = await api.get<BalancesBody>("/open-finance/balances")
    expect(after.body).toMatchObject({ source: "cache", cash: 2000 })
  })

  test("retrato vencido: busca na Pluggy", async () => {
    __setProvider(provider)
    setup()
    await runSync({ trigger: "cli" })
    await expireSnapshot("balances")

    provider.accounts[0].balance = 3000
    const res = await api.get<BalancesBody>("/open-finance/balances")
    expect(res.body).toMatchObject({ source: "live", cash: 3000 })
  })

  test("Pluggy fora do ar: último retrato, marcado como desatualizado", async () => {
    __setProvider(provider)
    setup()
    await runSync({ trigger: "cli" })
    await expireSnapshot("balances")
    provider.failWith = new Error("timeout")

    const down = await api.get<BalancesBody>("/open-finance/balances")
    expect(down.body).toMatchObject({ available: true, source: "cache", stale: true, error: "timeout", cash: 1000 })

    provider.failWith = null
    const back = await api.get<BalancesBody>("/open-finance/balances")
    expect(back.body).toMatchObject({ source: "live", stale: false })
  })
})

describe("e2e projeção com o saldo do Open Finance", () => {
  test("abre com a conta menos a fatura em aberto (sem a parcela futura)", async () => {
    __setProvider(provider)
    setup()
    await makeAccount("Carteira física", { type: "CASH" }) // sem vínculo: não entra
    await runSync({ trigger: "cli" })

    const res = await api.get<CashflowProjection>("/forecast/cashflow?horizonMonths=3")
    expect(res.body.openingBalanceSource).toBe("open_finance")
    // 1000 (conta) − (500 usados − 100 da parcela futura)
    expect(res.body.openingBalance).toBe(600)
    const names = res.body.openingAccounts.map((a) => a.name)
    expect(names).toContain("Nubank Cartão (fatura em aberto)")
    expect(names).not.toContain("Carteira física")
    expect(res.body.openingAccounts.find((a) => a.name === "Nubank Cartão (fatura em aberto)")!.balance).toBe(-400)
  })

  test("Pluggy fora do ar: usa o último retrato e avisa", async () => {
    __setProvider(provider)
    setup()
    await runSync({ trigger: "cli" })
    await expireSnapshot("balances")
    provider.failWith = new Error("fora")

    const res = await api.get<CashflowProjection>("/forecast/cashflow?horizonMonths=3")
    expect(res.body.openingBalanceSource).toBe("stale")
    expect(res.body.openingBalance).toBe(600)
  })

  test("sem Open Finance nem retrato: saldo zero e fonte indisponível", async () => {
    await makeAccount("Nubank")
    const res = await api.get<CashflowProjection>("/forecast/cashflow?horizonMonths=3")
    expect(res.body.openingBalanceSource).toBe("unavailable")
    expect(res.body.openingBalance).toBe(0)
  })
})

type InvestmentsBody = {
  available: boolean
  total: number
  invested: number
  profit: number
  liquid: number
  byClass: { assetClass: string; total: number; pct: number; count: number }[]
  positions: { code: string | null; assetClass: string; averagePrice: number | null; liquid: boolean }[]
  income: { last12m: number; byMonth: { month: string; total: number }[] }
}

function setupInvestments() {
  const recent = new Date(Date.now() - 20 * 86_400_000).toISOString()
  provider.investments = [
    { id: "cdb-1", type: "FIXED_INCOME", subtype: "CDB", name: "CDB", balance: 1000, amountOriginal: 900, gracePeriodDate: "2025-01-01" },
    { id: "cdb-locked", type: "FIXED_INCOME", subtype: "CDB", name: "CDB 2 anos", balance: 500, amountOriginal: 500, gracePeriodDate: "2099-01-01" },
    { id: "cdb-closed", type: "FIXED_INCOME", subtype: "CDB", name: "CDB resgatado", balance: 0, status: "TOTAL_WITHDRAWAL" },
    { id: "fii", type: "EQUITY", subtype: "REAL_ESTATE_FUND", name: "MXRF11", code: "MXRF11", balance: 500, quantity: 50, value: 10 },
  ]
  provider.investmentTransactions = {
    fii: [
      { id: "1", type: "BUY", quantity: 50, amount: 450, date: recent },
      { id: "2", type: "INTEREST", amount: 4.5, date: recent },
    ],
  }
}

describe("e2e GET /open-finance/investments", () => {
  test("sem configuração: indisponível", async () => {
    const res = await api.get<InvestmentsBody>("/open-finance/investments")
    expect(res.body.available).toBe(false)
  })

  test("posições ativas, alocação, lucro, liquidez e proventos", async () => {
    __setProvider(provider)
    setupInvestments()
    const res = await api.get<InvestmentsBody>("/open-finance/investments")
    expect(res.body).toMatchObject({ available: true, total: 2000, invested: 1850, profit: 150, liquid: 1000 })
    expect(res.body.positions).toHaveLength(3) // o resgatado fica de fora
    expect(res.body.byClass).toEqual([
      { assetClass: "Renda fixa", total: 1500, pct: 75, count: 2 },
      { assetClass: "FIIs", total: 500, pct: 25, count: 1 },
    ])
    expect(res.body.positions.find((p) => p.code === "MXRF11")!.averagePrice).toBe(9)
    expect(res.body.income.last12m).toBe(4.5)
  })

  test("falha do provedor sem retrato: indisponível", async () => {
    __setProvider(provider)
    provider.failWith = new Error("fora")
    const res = await api.get<InvestmentsBody>("/open-finance/investments")
    expect(res.body).toMatchObject({ available: false, error: "fora" })
  })

  test("retrato persistido: serve do banco e cai nele com a Pluggy fora", async () => {
    __setProvider(provider)
    setupInvestments()
    await api.get("/open-finance/investments")

    provider.failWith = new Error("não deveria chamar")
    const cached = await api.get<InvestmentsBody & { source: string; stale: boolean }>("/open-finance/investments")
    expect(cached.body).toMatchObject({ available: true, source: "cache", stale: false, total: 2000 })

    await expireSnapshot("investments")
    const stale = await api.get<InvestmentsBody & { source: string; stale: boolean }>("/open-finance/investments")
    expect(stale.body).toMatchObject({ available: true, source: "cache", stale: true, total: 2000 })
  })

  test("a projeção soma a renda fixa com liquidez diária ao caixa", async () => {
    __setProvider(provider)
    setup()
    setupInvestments()
    await runSync({ trigger: "cli" })
    const res = await api.get<CashflowProjection>("/forecast/cashflow?horizonMonths=3")
    // 1000 (conta) − 400 (fatura em aberto) + 1000 (CDB líquido; o de carência não conta)
    expect(res.body.openingBalance).toBe(1600)
    expect(res.body.openingAccounts.find((a) => a.id === "investments-liquid")!.balance).toBe(1000)
  })
})

describe("e2e GET /accounts marca as contas do Open Finance", () => {
  test("openFinance só nas vinculadas", async () => {
    __setProvider(provider)
    setup()
    await makeAccount("Nubank")
    await makeAccount("Itaú")
    await runSync({ trigger: "cli" })
    const res = await api.get<{ name: string; openFinance: boolean }[]>("/accounts")
    const byName = new Map(res.body.map((a) => [a.name, a.openFinance]))
    expect(byName.get("Nubank")).toBe(true)
    expect(byName.get("Nubank Cartão")).toBe(true)
    expect(byName.get("Itaú")).toBe(false)
  })
})
