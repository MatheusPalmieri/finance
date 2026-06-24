// Formata valor em reais: "R$ 1.234,56"
export function formatCurrency(value: number | string) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

// Formata valor compacto: "R$ 1,2k", "R$ 34,5k", "R$ 2,1M"
export function formatCurrencyCompact(value: number | string) {
  const n = Number(value)
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toFixed(1)}k`
  return formatCurrency(n)
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
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  return `${months[Number(month) - 1]} ${year}`
}
