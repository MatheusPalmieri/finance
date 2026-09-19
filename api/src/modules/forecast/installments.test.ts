import { describe, expect, test } from "bun:test"
import {
  InstallmentError,
  installmentAmount,
  totalPaid,
} from "./installments"

describe("installmentAmount", () => {
  test("sem juros: 4000 em 10x dá 400,00 exatos", () => {
    expect(installmentAmount(4000, 10, 0)).toBe(400)
  })

  test("installments: 1 devolve o total", () => {
    expect(installmentAmount(4000, 1, 0)).toBe(4000)
  })

  test("com 2% a.m.: conferido contra o cálculo à mão", () => {
    // parcela = 4000 * 0,02 / (1 - 1,02^-10) = 80 / (1 - 0,8203483...)
    const expected = (4000 * 0.02) / (1 - Math.pow(1.02, -10))
    expect(installmentAmount(4000, 10, 2)).toBeCloseTo(expected, 10)
    // Sanidade: com juros a parcela é maior que a divisão simples
    expect(installmentAmount(4000, 10, 2)).toBeGreaterThan(400)
  })

  test("à vista não rende juros mesmo com taxa informada", () => {
    expect(installmentAmount(1000, 1, 5)).toBe(1000)
  })

  test("juros negativo lança erro tipado", () => {
    expect(() => installmentAmount(1000, 10, -1)).toThrow(InstallmentError)
  })

  test("parcelas <= 0 lançam erro tipado", () => {
    expect(() => installmentAmount(1000, 0)).toThrow(InstallmentError)
    expect(() => installmentAmount(1000, -3)).toThrow(InstallmentError)
  })

  test("parcelas fracionárias lançam erro tipado", () => {
    expect(() => installmentAmount(1000, 2.5)).toThrow(InstallmentError)
  })

  test("valor não finito lança erro tipado", () => {
    expect(() => installmentAmount(Number.NaN, 10)).toThrow(InstallmentError)
  })
})

describe("totalPaid", () => {
  test("sem juros é o próprio total", () => {
    expect(totalPaid(4000, 10, 0)).toBeCloseTo(4000, 6)
  })

  test("com juros custa mais que o total", () => {
    expect(totalPaid(4000, 10, 2)).toBeGreaterThan(4000)
  })
})
