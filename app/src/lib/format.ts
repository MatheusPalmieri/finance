// Formata valor em reais: "R$ 1.234,56"
export function formatCurrency(value: number | string) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

// Formata valor compacto em pt-BR: "R$ 1,2 mil", "R$ 34,5 mil", "R$ 2,1 mi"
const compactFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatCurrencyCompact(value: number | string) {
  const n = Number(value)
  // Abaixo de mil o valor cheio é mais claro que "R$ 80"
  if (Math.abs(n) < 1_000) return formatCurrency(n)
  return compactFormatter.format(n)
}

// Data no formato "dd/MM/yyyy"
export function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR")
}

// Data e hora absolutas em pt-BR ("08/06/2026 14:30")
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Tempo relativo curto em pt-BR ("hoje", "ontem", "há 3d", "há 2m", "há 1a")
export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days <= 0) return "hoje"
  if (days === 1) return "ontem"
  if (days < 30) return `há ${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `há ${months}m`
  return `há ${Math.floor(months / 12)}a`
}

// "YYYY-MM" → "Jun 2026"
export function formatMonthLabel(ym: string) {
  const [year, month] = ym.split("-")
  const months = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ]
  return `${months[Number(month) - 1]} ${year}`
}

// Idade de um retrato do Open Finance: "agora", "há 3 min", "há 2 h" ou a
// data e hora. O `relativeTime` acima conta em dias — grosso demais para um
// dado que vence em minutos
export function snapshotAge(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
