import { describe, expect, test } from "bun:test"
import { averageCost, buildPosition, classify, isLiquid } from "./investments"

describe("classify", () => {
  test("classes por tipo e subtipo", () => {
    expect(classify({ type: "FIXED_INCOME", subtype: "CDB" })).toBe("Renda fixa")
    expect(classify({ type: "EQUITY", subtype: "REAL_ESTATE_FUND" })).toBe("FIIs")
    expect(classify({ type: "EQUITY", subtype: "STOCK" })).toBe("Ações")
    expect(classify({ type: "EQUITY", subtype: "BDR" })).toBe("BDRs")
    expect(classify({ type: "ETF", subtype: "ETF" })).toBe("ETFs")
    expect(classify({ type: "COE", subtype: null })).toBe("Outros")
  })
})

describe("averageCost", () => {
  test("compras somam, venda baixa pelo preço médio", () => {
    const basis = averageCost([
      { id: "1", type: "BUY", quantity: 10, amount: 100, date: "2026-07-01" },
      { id: "2", type: "BUY", quantity: 10, amount: 140, date: "2026-07-10" },
      { id: "3", type: "SELL", quantity: 5, amount: 70, date: "2026-08-01" },
      { id: "4", type: "INTEREST", quantity: null, amount: 3.9, date: "2026-08-19" },
    ])
    // preço médio 12; vende 5 → custo 240 − 60 = 180 para 15 cotas
    expect(basis.quantity).toBe(15)
    expect(basis.cost).toBe(180)
    expect(basis.averagePrice).toBe(12)
  })

  test("ordena por data antes de calcular", () => {
    const basis = averageCost([
      { id: "2", type: "SELL", quantity: 5, amount: 60, date: "2026-08-01" },
      { id: "1", type: "BUY", quantity: 10, amount: 100, date: "2026-07-01" },
    ])
    expect(basis.quantity).toBe(5)
    expect(basis.cost).toBe(50)
  })

  test("sem compra, sem preço médio", () => {
    expect(averageCost([]).averagePrice).toBeNull()
  })
})

describe("isLiquid", () => {
  test("renda fixa sem carência é liquidez diária", () => {
    expect(isLiquid({ id: "a", type: "FIXED_INCOME", gracePeriodDate: "2025-12-12T03:00:00.000Z" }, "2026-09-23")).toBe(true)
    expect(isLiquid({ id: "a", type: "FIXED_INCOME", gracePeriodDate: null }, "2026-09-23")).toBe(true)
    expect(isLiquid({ id: "a", type: "FIXED_INCOME", gracePeriodDate: "2027-01-01" }, "2026-09-23")).toBe(false)
  })

  test("renda variável nunca conta como caixa", () => {
    expect(isLiquid({ id: "a", type: "EQUITY" }, "2026-09-23")).toBe(false)
  })
})

describe("buildPosition", () => {
  test("CDB: lucro líquido sobre o aplicado e IR", () => {
    const p = buildPosition(
      {
        id: "cdb",
        type: "FIXED_INCOME",
        subtype: "CDB",
        name: "CDB NU",
        balance: 65.27,
        amount: 66.58,
        amountOriginal: 60,
        taxes: 1.31,
        taxes2: 0,
        rate: 100,
        rateType: "CDI",
        dueDate: "2027-12-12T03:00:00.000Z",
        gracePeriodDate: "2025-12-12T03:00:00.000Z",
      },
      [],
      "2025-09-23"
    )
    expect(p).toMatchObject({
      assetClass: "Renda fixa",
      balance: 65.27,
      invested: 60,
      profit: 5.27,
      profitPct: 8.78,
      taxes: 1.31,
      dueDate: "2027-12-12",
      liquid: true,
      price: null,
    })
  })

  test("FII: preço médio pelas compras e proventos de 12 meses", () => {
    const p = buildPosition(
      { id: "fii", type: "EQUITY", subtype: "REAL_ESTATE_FUND", name: "VGIA11", code: "VGIA11", balance: 262.2, quantity: 30, value: 8.74 },
      [
        { id: "1", type: "BUY", quantity: 10, amount: 82.8, date: "2026-07-31" },
        { id: "2", type: "BUY", quantity: 20, amount: 166.8, date: "2026-08-05" },
        { id: "3", type: "INTEREST", amount: 3.9, date: "2026-08-19" },
        { id: "4", type: "INTEREST", amount: 1, date: "2025-01-01" },
      ],
      "2025-09-23"
    )
    expect(p).toMatchObject({
      assetClass: "FIIs",
      invested: 249.6,
      profit: 12.6,
      averagePrice: 8.32,
      price: 8.74,
      incomeLast12m: 3.9,
      liquid: false,
    })
  })
})
