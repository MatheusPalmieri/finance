// Fonte ÚNICA de cores de dados/visualização da aplicação.
//
// Por que aqui (e não só no index.css)?
// - Cores armazenadas no banco (category.color, account.color) são hex.
// - O seletor de cor grava hex.
// - Recharts e estilos inline (`style={{ backgroundColor }}`) precisam de string.
// Logo, a paleta de DADOS vive em JS, como hex. Os tokens semânticos do tema
// (background, card, primary esmeralda, etc.) vivem no index.css e são consumidos
// via classes Tailwind. Nenhum hex deve ser escrito solto fora deste arquivo.

// ── Paleta base (escala nomeada) ──────────────────────────────────────────────
export const PALETTE = {
  emerald: "#10b981",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  pink: "#ec4899",
  rose: "#f43f5e",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  slate: "#64748b",
  gray: "#6b7280",
} as const

// ── Cores semânticas de finanças ──────────────────────────────────────────────
// Significado fixo de negócio — reutilizado por gráficos, badges e barras.
export const FINANCE = {
  essential: PALETTE.amber, // gasto essencial
  nonEssential: PALETTE.violet, // gasto não essencial
  fixed: PALETTE.indigo, // recorrência fixa
  variable: PALETTE.teal, // recorrência variável
  expense: PALETTE.red, // saída de dinheiro
  income: PALETTE.emerald, // entrada / crescimento
  neutral: PALETTE.gray, // sem categoria / fallback
} as const

// ── Paleta ordenada para séries de gráfico ────────────────────────────────────
// Lidera com o esmeralda (cor da marca) e segue com acentos contrastantes.
export const CHART_PALETTE = [
  PALETTE.emerald,
  PALETTE.blue,
  PALETTE.amber,
  PALETTE.violet,
  PALETTE.rose,
  PALETTE.cyan,
  PALETTE.orange,
  PALETTE.purple,
]

// ── Swatches do seletor de cor (CRUD de entidades / contas) ───────────────────
export const PICKER_SWATCHES = [
  PALETTE.emerald,
  PALETTE.blue,
  PALETTE.indigo,
  PALETTE.violet,
  PALETTE.purple,
  PALETTE.pink,
  PALETTE.red,
  PALETTE.orange,
  PALETTE.amber,
  PALETTE.teal,
  PALETTE.cyan,
  PALETTE.gray,
]

// Cor padrão usada como fallback de formulário/seletor.
export const DEFAULT_PICKER_COLOR = PALETTE.emerald

// ── Helper de tingimento ──────────────────────────────────────────────────────
// Substitui o antigo padrão frágil `${color}1a` (exigia hex de 6 dígitos):
// gera um fundo translúcido a partir de qualquer cor CSS válida.
export function tint(color: string, percent = 12) {
  return `color-mix(in oklch, ${color} ${percent}%, transparent)`
}
