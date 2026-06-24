// Formatadores e helpers de eixo compartilhados pelos gráficos.
// Mantidos fora de components/charts.tsx para não misturar exports de valores
// com exports de componentes (regra react-refresh/only-export-components).
// A paleta vive em lib/tokens.ts (fonte única) — reexportada aqui por conveniência.
export { CHART_PALETTE, PALETTE as CHART_COLORS } from "./tokens"

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
