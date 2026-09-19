import { describe, expect, test } from "bun:test"
import {
  addDays,
  coefficientOfVariation,
  daysBetween,
  mad,
  mean,
  median,
  robustZ,
  stdDev,
} from "./stats"

describe("median", () => {
  test("ímpar pega o do meio", () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  test("par tira a média dos dois centrais", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  test("vazio devolve null", () => {
    expect(median([])).toBeNull()
  })
})

describe("mean e stdDev", () => {
  test("média conferida na mão", () => {
    expect(mean([2, 4, 6])).toBe(4)
  })

  test("desvio-padrão populacional conferido na mão", () => {
    // média 4; desvios -2, 0, 2; variância (4+0+4)/3 = 8/3
    expect(stdDev([2, 4, 6])).toBeCloseTo(Math.sqrt(8 / 3), 10)
  })

  test("um ponto só devolve null", () => {
    expect(stdDev([5])).toBeNull()
  })
})

describe("coefficientOfVariation", () => {
  test("valores idênticos dão 0", () => {
    expect(coefficientOfVariation([10, 10, 10])).toBe(0)
  })

  test("média zero devolve null", () => {
    expect(coefficientOfVariation([-5, 5])).toBeNull()
  })
})

describe("mad", () => {
  test("conferido na mão", () => {
    // mediana 3; desvios 2,1,0,1,2 → mediana dos desvios = 1
    expect(mad([1, 2, 3, 4, 5])).toBe(1)
  })

  test("valores idênticos dão 0", () => {
    expect(mad([7, 7, 7])).toBe(0)
  })
})

describe("robustZ", () => {
  test("menos de 3 pontos devolve null em vez de lançar", () => {
    expect(robustZ(100, [10, 20])).toBeNull()
  })

  test("valor na mediana dá z = 0", () => {
    expect(robustZ(3, [1, 2, 3, 4, 5])?.z).toBe(0)
  })

  test("valor muito acima dispara z alto", () => {
    // mediana 3, MAD 1 → z = 0.6745 * (10-3) / 1
    expect(robustZ(10, [1, 2, 3, 4, 5])?.z).toBeCloseTo(0.6745 * 7, 6)
  })

  test("MAD zero cai na variação percentual", () => {
    const result = robustZ(1100, [1000, 1000, 1000])
    expect(result?.usedPercentFallback).toBe(true)
    // +10% é exatamente o limiar medium (z = 2)
    expect(result?.z).toBeCloseTo(2, 6)
  })

  test("MAD zero com mediana zero não divide por zero", () => {
    expect(robustZ(50, [0, 0, 0])?.z).toBe(0)
  })

  test("economia forte dá z negativo", () => {
    expect(robustZ(1, [10, 10, 10, 12, 8])!.z).toBeLessThan(-2)
  })
})

describe("datas", () => {
  test("daysBetween ignora fuso", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30)
  })

  test("daysBetween atravessa mês e ano", () => {
    expect(daysBetween("2025-12-15", "2026-01-15")).toBe(31)
  })

  test("addDays devolve YYYY-MM-DD", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01")
  })
})
