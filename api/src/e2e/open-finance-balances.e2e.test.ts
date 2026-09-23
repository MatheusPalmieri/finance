// E2E da spec 04 (F5) — saldo ao vivo e seu uso na projeção.

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { __clearBalanceCache } from "../modules/open-finance/balances"
import { __clearInvestmentsCache } from "../modules/open-finance/investments"
import { __setProvider } from "../modules/open-finance/provider"
import { MockOpenFinanceProvider } from "../modules/open-finance/providers/mock"
import { runSync } from "../modules/open-finance/sync"
import type { CashflowProjection } from "../modules/forecast/types"
import { api, makeAccount, makeCategory, resetDatabase } from "../test/helpers"

type BalancesBody = {
  available: boolean
  error: string | null
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

beforeEach(async () => {
  await resetDatabase()
  __clearBalanceCache()
  __clearInvestmentsCache()
  await makeCategory("Outros")
  provider = new MockOpenFinanceProvider()
})
afterEach(() => {
  __setProvider(null)
  __clearBalanceCache()
  __clearInvestmentsCache()
})

describe("e2e GET /open-finance/balances", () => {
  test("sem configuração: indisponível", async () => {
    const res = await api.get<BalancesBody>("/open-finance/balances")
    expect(res.body.available).toBe(false)
    expect(res.body.error).toContain("não configurado")
  })

  test("antes do primeiro sync: indisponível (não há vínculo de contas)", async () => {
    __setProvider(provider)
    setup()
    const res = await api.get<BalancesBody>("/open-finance/balances")
    expect(res.body.available).toBe(false)
  })

  test("ao vivo: saldo da conta, fatura e limite do cartão", async () => {
    __setProvider(provider)
    setup()
    await makeAccount("Nubank")
    await runSync({ trigger: "cli" })

    const res = await api.get<BalancesBody>("/open-finance/balances")
    expect(res.body.available).toBe(true)
    expect(res.body.cash).toBe(1000)
    expect(res.body.cardDebt).toBe(500)
    const card = res.body.accounts.find((a) => a.type === "CREDIT")!
    expect(card).toMatchObject({ accountName: "Nubank Cartão", creditLimit: 5000, dueDate: "2026-10-08" })
  })

  test("cache de 60s; fresh=true busca de novo", async () => {
    __setProvider(provider)
    setup()
    await runSync({ trigger: "cli" })
    await api.get("/open-finance/balances")

    provider.accounts[0].balance = 2000
    const cached = await api.get<BalancesBody>("/open-finance/balances")
    expect(cached.body.cash).toBe(1000)
    const fresh = await api.get<BalancesBody>("/open-finance/balances?fresh=true")
    expect(fresh.body.cash).toBe(2000)
  })

  test("Pluggy fora do ar: indisponível e sem cache da falha", async () => {
    __setProvider(provider)
    setup()
    await runSync({ trigger: "cli" })
    provider.failWith = new Error("timeout")
    const down = await api.get<BalancesBody>("/open-finance/balances")
    expect(down.body).toMatchObject({ available: false, error: "timeout" })

    provider.failWith = null
    const back = await api.get<BalancesBody>("/open-finance/balances")
    expect(back.body.available).toBe(true)
  })
})

describe("e2e projeção com saldo ao vivo", () => {
  test("abre com conta ao vivo menos a fatura em aberto (sem a parcela futura)", async () => {
    __setProvider(provider)
    setup()
    await makeAccount("Nubank", { balance: 99999 }) // cadastrado é ignorado quando há saldo ao vivo
    await makeAccount("Carteira física", { type: "CASH", balance: 50 })
    await runSync({ trigger: "cli" })

    const res = await api.get<CashflowProjection>("/forecast/cashflow?horizonMonths=3")
    expect(res.body.openingBalanceSource).toBe("live")
    // 1000 (conta) + 50 (sem vínculo) − (500 usados − 100 da parcela futura)
    expect(res.body.openingBalance).toBe(650)
    const names = res.body.openingAccounts.map((a) => a.name)
    expect(names).toContain("Nubank Cartão (fatura em aberto)")
    expect(res.body.openingAccounts.find((a) => a.name === "Nubank Cartão (fatura em aberto)")!.balance).toBe(-400)
  })

  test("sem Pluggy, cai no saldo cadastrado", async () => {
    await makeAccount("Nubank", { balance: 300 })
    const res = await api.get<CashflowProjection>("/forecast/cashflow?horizonMonths=3")
    expect(res.body.openingBalanceSource).toBe("stored")
    expect(res.body.openingBalance).toBe(300)
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

  test("falha do provedor: indisponível", async () => {
    __setProvider(provider)
    provider.failWith = new Error("fora")
    const res = await api.get<InvestmentsBody>("/open-finance/investments")
    expect(res.body).toMatchObject({ available: false, error: "fora" })
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
