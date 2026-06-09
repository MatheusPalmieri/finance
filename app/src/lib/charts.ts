// Constantes e formatadores compartilhados pelos gráficos (Funil + Dashboard).
// Mantidos fora de components/charts.tsx para não misturar exports de valores
// com exports de componentes (regra react-refresh/only-export-components).

// ── Paleta de gráficos (fonte única) ────────────────────────────────────────
export const CHART_COLORS = {
  blue: "#3b82f6",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  emerald: "#10b981",
  indigo: "#6366f1",
  rose: "#f43f5e",
  cyan: "#06b6d4",
  purple: "#a855f7",
  slate: "#64748b",
  red: "#ef4444",
} as const

export const CHART_PALETTE = [
  CHART_COLORS.blue,
  CHART_COLORS.violet,
  CHART_COLORS.amber,
  CHART_COLORS.emerald,
  CHART_COLORS.indigo,
  CHART_COLORS.rose,
  CHART_COLORS.cyan,
  CHART_COLORS.purple,
]

// ── Formatadores (pt-BR) ─────────────────────────────────────────────────────
export const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })

export const fmtCompact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n)

export const fmtBRLk = (n: number) => `R$ ${fmtCompact(n)}`

export const fmtNum = (n: number) => n.toLocaleString("pt-BR")

// ── Eixos / grid recharts com tokens do tema ────────────────────────────────
export const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 }
export const gridStroke = "var(--border)"
