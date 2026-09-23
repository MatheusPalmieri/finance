// PRNG com semente. Nunca `Math.random()`: a mesma projeção consultada duas
// vezes precisa devolver exatamente os mesmos números — o usuário não pode ver
// o gráfico mudar sozinho ao dar F5.

/** mulberry32 — rápido, 32 bits de estado, qualidade suficiente para bootstrap. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Semente estável derivada do período (hash FNV-1a de 32 bits). */
export function deriveSeed(month: number, year: number): number {
  // O sufixo "global" preserva as sementes de antes da remoção das carteiras
  const input = `${year}-${month}-global`
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Sorteia um elemento do array com reposição (bootstrap). */
export function sample<T>(values: readonly T[], rand: () => number): T {
  return values[Math.floor(rand() * values.length)]
}

/**
 * Amostra de uma distribuição triangular — usada nos orçamentos de faixa
 * (`amountType: "variable"`), onde só conhecemos mínimo, máximo e a moda
 * (a mediana do realizado).
 */
export function triangular(
  min: number,
  mode: number,
  max: number,
  rand: () => number
): number {
  if (max <= min) return min
  const clampedMode = Math.min(Math.max(mode, min), max)
  const u = rand()
  const split = (clampedMode - min) / (max - min)
  return u < split
    ? min + Math.sqrt(u * (max - min) * (clampedMode - min))
    : max - Math.sqrt((1 - u) * (max - min) * (max - clampedMode))
}
