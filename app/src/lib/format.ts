// Formatadores de domínio compartilhados pela UI.

// Telefone para exibição: "(11) 9999-9999"
export function formatPhone(areaCode: string, number: string) {
  return `(${areaCode}) ${number.slice(0, 4)}-${number.slice(4)}`
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
