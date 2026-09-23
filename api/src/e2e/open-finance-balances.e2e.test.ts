// E2E da spec 04 (F5) — saldo ao vivo e seu uso na projeção.

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { __clearBalanceCache } from "../modules/open-finance/balances"
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
  await makeCategory("Outros")
  provider = new MockOpenFinanceProvider()
})
afterEach(() => {
  __setProvider(null)
  __clearBalanceCache()
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
