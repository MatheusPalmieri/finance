// Estatística descritiva pura, sem I/O. Compartilhada pelo detector de
// recorrências (spec 01) e pelas anomalias do check-up mensal (spec 02) —
// por isso mora em `lib/` e não dentro de um dos dois módulos.
//
// Usamos mediana e MAD em vez de média e desvio-padrão nas anomalias: com 6
// pontos de histórico, um mês atípico contamina a média e o alerta nunca dispara.

export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

/** Desvio-padrão populacional. `null` com menos de 2 pontos. */
export function stdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const avg = mean(values)!
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/** Coeficiente de variação (desvio/média). `null` quando a média é 0. */
export function coefficientOfVariation(values: number[]): number | null {
  const avg = mean(values)
  const sd = stdDev(values)
  if (avg === null || sd === null || avg === 0) return null
  return sd / Math.abs(avg)
}

/** Desvio absoluto mediano — a mediana de |x − mediana(x)|. */
export function mad(values: number[]): number | null {
  const med = median(values)
  if (med === null) return null
  return median(values.map((v) => Math.abs(v - med)))
}

/** Constante que torna o MAD comparável ao desvio-padrão numa normal. */
const MAD_SCALE = 0.6745

/** Mínimo de pontos para um z robusto significar alguma coisa. */
export const MIN_HISTORY_POINTS = 3

export interface RobustZ {
  z: number
  median: number
  /** true quando o MAD é 0 e caímos na variação percentual simples. */
  usedPercentFallback: boolean
}

/**
 * Z robusto do valor atual contra o histórico.
 *
 * Com `MAD = 0` (valor idêntico todo mês, ex.: aluguel) o z seria infinito,
 * então caímos numa variação percentual simples com limiar de 10%: uma variação
 * de 10% vira |z| = 2 (o limiar `medium`), e escala proporcionalmente.
 *
 * Devolve `null` com menos de `MIN_HISTORY_POINTS` pontos, em vez de lançar.
 */
export function robustZ(current: number, history: number[]): RobustZ | null {
  if (history.length < MIN_HISTORY_POINTS) return null
  const med = median(history)!
  const dispersion = mad(history)!

  if (dispersion === 0) {
    if (med === 0) return { z: 0, median: med, usedPercentFallback: true }
    const changePct = (current - med) / Math.abs(med)
    return {
      z: (changePct / 0.1) * 2,
      median: med,
      usedPercentFallback: true,
    }
  }

  return {
    z: (MAD_SCALE * (current - med)) / dispersion,
    median: med,
    usedPercentFallback: false,
  }
}

/** Dias entre duas datas YYYY-MM-DD (UTC, sem fuso). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** Soma dias a uma data YYYY-MM-DD, devolvendo YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}
