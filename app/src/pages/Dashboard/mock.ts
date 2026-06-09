// Dados mockados do dashboard operacional — CRM de disparos para vender SaaS.
// Gerados de forma determinística (seed fixa) no carregamento do módulo, então
// são estáveis entre renders (os gráficos não "tremem").
import { CHART_COLORS } from "@/lib/charts"

// PRNG determinístico (mulberry32)
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260608)
const rint = (min: number, max: number) =>
  Math.floor(min + rand() * (max - min + 1))
const pad = (n: number) => String(n).padStart(2, "0")

// ── Receita / clientes por mês (últimos 12 meses) ────────────────────────────
export const MONTHS = [
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
]

export const revenueByMonth = MONTHS.map((month, i) => {
  const mrr = Math.round(38000 + i * 5200 + rint(-1800, 1800))
  const newCustomers = rint(16, 38)
  const churned = rint(2, 9)
  return {
    month,
    mrr,
    expansion: Math.round(mrr * (0.06 + rand() * 0.05)),
    newCustomers,
    churned,
    net: newCustomers - churned,
    conversion: Number((rint(9, 19) + rand()).toFixed(1)),
  }
})

// ── Disparos diários (últimos 90 dias) ───────────────────────────────────────
const today = new Date(2026, 5, 8) // 08/06/2026 (mês 0-indexado)

export const dailyMessaging = Array.from({ length: 90 }, (_, i) => {
  const d = new Date(today)
  d.setDate(today.getDate() - (89 - i))
  const dow = d.getDay()
  const weekendFactor = dow === 0 || dow === 6 ? 0.35 : 1
  const sent = Math.round(rint(220, 460) * weekendFactor)
  const delivered = Math.round(sent * (0.9 + rand() * 0.07))
  const replied = Math.round(delivered * (0.16 + rand() * 0.14))
  const optOut = Math.round(delivered * (0.008 + rand() * 0.02))
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
    sent,
    delivered,
    replied,
    optOut,
  }
})

// ── Canais de disparo ─────────────────────────────────────────────────────────
export const channels = [
  { name: "WhatsApp", color: CHART_COLORS.emerald, sent: 18420, replied: 4120 },
  { name: "E-mail", color: CHART_COLORS.blue, sent: 12880, replied: 1740 },
  { name: "Instagram", color: CHART_COLORS.purple, sent: 6240, replied: 1180 },
  { name: "SMS", color: CHART_COLORS.amber, sent: 4310, replied: 520 },
].map((c) => ({
  ...c,
  responseRate: Number(((c.replied / c.sent) * 100).toFixed(1)),
}))

// Status das mensagens por canal (para barra empilhada)
export const messageStatusByChannel = channels.map((c) => {
  const delivered = Math.round(c.sent * 0.94)
  const optOut = Math.round(delivered * 0.02)
  const replied = c.replied
  return {
    channel: c.name,
    Respondido: replied,
    "Sem resposta": delivered - replied - optOut,
    "Opt-out": optOut,
    "Não entregue": c.sent - delivered,
  }
})

// ── Mapa de calor: melhor horário de disparo (taxa de resposta %) ────────────
export const HEAT_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
export const HEAT_HOURS = ["08h", "10h", "12h", "14h", "16h", "18h", "20h"]

export const heatmap = HEAT_DAYS.map((day, di) =>
  HEAT_HOURS.map((hour, hi) => {
    const weekend = di >= 5 ? 0.5 : 1
    // Picos no meio da manhã e fim de tarde
    const peak = hi === 1 || hi === 4 || hi === 5 ? 1.35 : 1
    const rate = Number((rint(6, 22) * weekend * peak).toFixed(0))
    return { day, hour, rate, di, hi }
  })
)
export const heatMax = Math.max(...heatmap.flat().map((c) => c.rate))

// ── Planos (assinatura SaaS) ─────────────────────────────────────────────────
export const plans = [
  { name: "Starter", price: 97, customers: 142, color: CHART_COLORS.slate },
  { name: "Pro", price: 297, customers: 98, color: CHART_COLORS.blue },
  { name: "Business", price: 697, customers: 41, color: CHART_COLORS.violet },
  { name: "Enterprise", price: 1990, customers: 12, color: CHART_COLORS.emerald },
].map((p) => ({ ...p, mrr: p.price * p.customers }))

// ── Canais de aquisição (de onde vem a receita) ─────────────────────────────
export const acquisition = [
  { source: "Outbound (disparos)", value: 52, color: CHART_COLORS.blue },
  { source: "Indicação", value: 21, color: CHART_COLORS.emerald },
  { source: "Orgânico", value: 16, color: CHART_COLORS.violet },
  { source: "Ads", value: 11, color: CHART_COLORS.amber },
]

// ── Performance por SDR ───────────────────────────────────────────────────────
const SDR_NAMES = [
  "Ana Beatriz", "Carlos Eduardo", "Mariana Lopes",
  "Rafael Souza", "Juliana Pires", "Thiago Martins",
]
export const sdrs = SDR_NAMES.map((name) => {
  const leads = rint(180, 420)
  const conversions = Math.round(leads * (0.08 + rand() * 0.1))
  const meta = rint(62, 124)
  return {
    name,
    leads,
    conversions,
    convRate: Number(((conversions / leads) * 100).toFixed(1)),
    meta,
    revenue: conversions * rint(280, 760),
  }
}).sort((a, b) => b.conversions - a.conversions)

export const teamGoal = {
  achieved: sdrs.reduce((s, x) => s + x.conversions, 0),
  target: 320,
}

// ── Clientes / receita por cidade ─────────────────────────────────────────────
export const citiesPerf = [
  "Florianópolis", "Joinville", "Blumenau", "Itajaí",
  "Chapecó", "Criciúma", "Balneário Camboriú", "Lages",
].map((city) => {
  const customers = rint(14, 64)
  return { city, customers, mrr: customers * rint(180, 420) }
}).sort((a, b) => b.customers - a.customers)

// ── Totais derivados para os KPIs ─────────────────────────────────────────────
const totalSent30d = dailyMessaging
  .slice(-30)
  .reduce((s, d) => s + d.sent, 0)
const totalReplied30d = dailyMessaging
  .slice(-30)
  .reduce((s, d) => s + d.replied, 0)
const lastMrr = revenueByMonth[revenueByMonth.length - 1].mrr
const prevMrr = revenueByMonth[revenueByMonth.length - 2].mrr
const activeCustomers = plans.reduce((s, p) => s + p.customers, 0)

export const kpis = {
  mrr: lastMrr,
  mrrGrowth: Number((((lastMrr - prevMrr) / prevMrr) * 100).toFixed(1)),
  arr: lastMrr * 12,
  activeCustomers,
  newCustomers: revenueByMonth[revenueByMonth.length - 1].newCustomers,
  churnRate: 2.4,
  messagesSent: totalSent30d,
  responseRate: Number(((totalReplied30d / totalSent30d) * 100).toFixed(1)),
  conversionRate: revenueByMonth[revenueByMonth.length - 1].conversion,
  ticket: Math.round(lastMrr / activeCustomers),
  cac: 184,
  ltv: 3120,
}

export type Period = "30d" | "90d" | "12m"
