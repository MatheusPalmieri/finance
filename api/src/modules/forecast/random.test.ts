import { describe, expect, test } from "bun:test"
import { deriveSeed, mulberry32, sample, triangular } from "./random"

describe("mulberry32", () => {
  test("mesma semente, mesma sequência", () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const first = Array.from({ length: 10 }, a)
    const second = Array.from({ length: 10 }, b)
    expect(first).toEqual(second)
  })

  test("sementes diferentes divergem", () => {
    const a = Array.from({ length: 10 }, mulberry32(1))
    const b = Array.from({ length: 10 }, mulberry32(2))
    expect(a).not.toEqual(b)
  })

  test("valores ficam em [0, 1)", () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const value = rand()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe("deriveSeed", () => {
  test("é estável para o mesmo período e carteira", () => {
    expect(deriveSeed(9, 2026, "w1")).toBe(deriveSeed(9, 2026, "w1"))
  })

  test("muda com a carteira e com o período", () => {
    expect(deriveSeed(9, 2026, "w1")).not.toBe(deriveSeed(9, 2026, "w2"))
    expect(deriveSeed(9, 2026, "w1")).not.toBe(deriveSeed(10, 2026, "w1"))
  })

  test("carteira nula tem semente própria e estável", () => {
    expect(deriveSeed(9, 2026, null)).toBe(deriveSeed(9, 2026, null))
  })
})

describe("sample", () => {
  test("sempre devolve um elemento do array", () => {
    const rand = mulberry32(3)
    const values = [1, 2, 3]
    for (let i = 0; i < 100; i++) {
      expect(values).toContain(sample(values, rand))
    }
  })
})

describe("triangular", () => {
  test("fica sempre dentro da faixa", () => {
    const rand = mulberry32(5)
    for (let i = 0; i < 1000; i++) {
      const value = triangular(100, 150, 200, rand)
      expect(value).toBeGreaterThanOrEqual(100)
      expect(value).toBeLessThanOrEqual(200)
    }
  })

  test("faixa degenerada devolve o mínimo", () => {
    expect(triangular(100, 100, 100, mulberry32(1))) .toBe(100)
  })

  test("a média fica perto de (min + moda + max) / 3", () => {
    const rand = mulberry32(11)
    let sum = 0
    const runs = 20000
    for (let i = 0; i < runs; i++) sum += triangular(0, 50, 100, rand)
    expect(sum / runs).toBeCloseTo(50, 0)
  })
})
