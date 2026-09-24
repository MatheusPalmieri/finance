// Seed base das regras de classificação, montada a partir dos 6 meses de
// transações reais do Open Finance.
//
// Os patterns são comparados com o nome que o sync monta (`displayName` em
// open-finance/normalize.ts: "Tipo - Contraparte", "Pix para X"), já sem acento
// e em minúsculas. A forma de pagamento não entra aqui: quem resolve é o
// próprio Open Finance. Pix para pessoas também fica sem regra — o destinatário
// muda demais, quem cuida é o histórico (kNN) e a IA.
//
// Ordem importa: específicas antes das genéricas (vira `priority`).
// `categoryName` é resolvido por nome exato; categoria inexistente vira `null`.
//
// Idempotente: roda quantas vezes quiser, nunca duplica nem sobrescreve o que
// o usuário editou (só insere o que falta).

import { eq, sql } from "drizzle-orm"
import { db } from "."
import {
  categories,
  classificationRules,
  type NewClassificationRule,
  type Recurrence,
} from "./schema"

interface SeedRule {
  /** Um ou mais textos; qualquer um que apareça na descrição casa a regra. */
  patterns: string[]
  /** Sem `renameTo` o nome original do extrato é mantido. */
  renameTo?: string
  categoryName?: string
  /** Força o sinal, ignorando o do extrato. */
  forceIncome?: boolean
  recurrence?: Recurrence
}

export const SEED_RULES: SeedRule[] = [
  // ── Renda e investimento ──────────────────────────────────────────────────
  {
    patterns: ["transferencia recebida - matheus andre palmieri ltda"],
    renameTo: "Salário",
    categoryName: "Salário",
  },
  {
    patterns: ["aplicacao rdb"],
    categoryName: "Investimento",
    forceIncome: true,
    recurrence: "variable",
  },
  {
    patterns: ["resgate rdb"],
    categoryName: "Investimento",
    recurrence: "variable",
  },
  {
    // Rendimento em centavos, vem várias vezes por mês
    patterns: ["valor recebido de investimentos"],
    renameTo: "Rendimento",
    categoryName: "Investimento",
  },
  {
    patterns: [
      "compra de renda variavel",
      "compra de criptomoedas",
      "venda de criptomoedas",
    ],
    categoryName: "Investimento",
  },
  {
    patterns: ["resgate de cashback"],
    renameTo: "Cashback",
    categoryName: "Investimento",
  },

  // ── Moradia e contas fixas ────────────────────────────────────────────────
  {
    patterns: ["conceito imobiliaria", "alles imoveis"],
    renameTo: "Aluguel",
    categoryName: "Moradia",
  },
  {
    patterns: ["edificio ilha de cozumel"],
    renameTo: "Condomínio",
    categoryName: "Moradia",
  },
  {
    patterns: ["celesc distribuicao"],
    renameTo: "Conta de luz",
    categoryName: "Moradia",
  },
  {
    patterns: ["fianca loft"],
    renameTo: "Fiança Loft",
    categoryName: "Moradia",
  },
  {
    patterns: ["unifique"],
    renameTo: "Internet Unifique",
    categoryName: "Serviços",
  },
  { patterns: ["fatura claro"], renameTo: "Claro", categoryName: "Serviços" },
  { patterns: ["conta vivo"], renameTo: "Vivo", categoryName: "Serviços" },
  { patterns: ["plano nucel"], renameTo: "Nucel", categoryName: "Serviços" },

  // ── Transporte ────────────────────────────────────────────────────────────
  {
    patterns: ["aymore credito"],
    renameTo: "Financiamento do carro",
    categoryName: "Transporte",
  },
  {
    patterns: ["shellbox", "shell box", "auto posto", "posto fl"],
    renameTo: "Combustível",
    categoryName: "Transporte",
  },
  {
    patterns: ["shopping park", "estacionamento", "cloudpark", "bc. park"],
    renameTo: "Estacionamento",
    categoryName: "Transporte",
  },
  {
    patterns: ["transacao de nutag"],
    renameTo: "Pedágio Nutag",
    categoryName: "Transporte",
  },
  {
    patterns: ["taxa de emissao de nutag"],
    renameTo: "Taxa Nutag",
    categoryName: "Transporte",
  },

  // ── Alimentação (mantém o nome do estabelecimento) ────────────────────────
  {
    patterns: [
      "giassi",
      "bistek",
      "angeloni",
      "supermercado meschke",
      "fort atacadista",
      "cooper filial blumenau",
    ],
    categoryName: "Alimentação",
  },
  { patterns: ["marmita"], categoryName: "Alimentação" },
  { patterns: ["ifd*", "ifd *", "ifood"], categoryName: "Alimentação" },
  {
    patterns: ["mc donalds", "mcdonalds", "arcos dourados", "burger king"],
    categoryName: "Alimentação",
  },

  // ── Assinaturas ───────────────────────────────────────────────────────────
  { patterns: ["spotify"], renameTo: "Spotify", categoryName: "Música" },
  {
    patterns: ["youtubepremium"],
    renameTo: "YouTube Premium",
    categoryName: "Assinaturas",
  },
  { patterns: ["hbo max"], renameTo: "HBO Max", categoryName: "Assinaturas" },
  {
    patterns: ["amazon prime"],
    renameTo: "Amazon Prime",
    categoryName: "Assinaturas",
  },
  { patterns: ["github"], renameTo: "GitHub", categoryName: "Assinaturas" },
  {
    patterns: ["apple.com/bill"],
    renameTo: "Apple",
    categoryName: "Assinaturas",
  },
  {
    patterns: ["google one"],
    renameTo: "Google One",
    categoryName: "Assinaturas",
  },
  { patterns: ["openai"], renameTo: "OpenAI", categoryName: "Assinaturas" },
  { patterns: ["anthropic"], renameTo: "Claude", categoryName: "Assinaturas" },

  // ── Saúde, estudos e lazer ────────────────────────────────────────────────
  { patterns: ["academia"], renameTo: "Academia", categoryName: "Saúde" },
  { patterns: ["panvel", "drogablu", "farmacia"], categoryName: "Saúde" },
  {
    patterns: ["yduqs", "universidades estacio"],
    renameTo: "Faculdade",
    categoryName: "Estudos",
  },
  {
    patterns: ["beto carrero"],
    renameTo: "Beto Carrero",
    categoryName: "Lazer",
  },
  {
    patterns: ["sympla", "ingresso.com", "oiingressos"],
    renameTo: "Ingressos",
    categoryName: "Lazer",
  },
  { patterns: ["steam"], renameTo: "Steam", categoryName: "Lazer" },

  // ── Taxas ─────────────────────────────────────────────────────────────────
  {
    patterns: ["iof de compra", "iof gerado"],
    renameTo: "IOF",
    categoryName: "Outros",
  },
]

const PRIORITY_START = 900
// Passo de 10 (e não de 100): são ~60 patterns, e um passo de 100 levaria as
// últimas a prioridade negativa, achatando a ordem justamente onde estão as
// regras genéricas que precisam ser avaliadas por último.
const PRIORITY_STEP = 10

export async function seedClassificationRules() {
  const catalog = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
  const categoryByName = new Map(
    catalog.map((c) => [c.name.toLowerCase(), c.id])
  )

  const existing = await db
    .select({ pattern: classificationRules.pattern })
    .from(classificationRules)
    .where(eq(classificationRules.matchType, "contains"))
  const existingPatterns = new Set(existing.map((r) => r.pattern))

  // Cada regra pode ter vários patterns; a prioridade cai por pattern
  const flat = SEED_RULES.flatMap((rule) =>
    rule.patterns.map((pattern) => ({ rule, pattern }))
  )

  const values: NewClassificationRule[] = []
  flat.forEach(({ rule, pattern }, i) => {
    if (existingPatterns.has(pattern)) return
    values.push({
      pattern,
      matchType: "contains",
      source: "seed",
      priority: Math.max(PRIORITY_START - i * PRIORITY_STEP, 1),
      renameTo: rule.renameTo ?? null,
      categoryId: rule.categoryName
        ? (categoryByName.get(rule.categoryName.toLowerCase()) ?? null)
        : null,
      recurrence: rule.recurrence ?? null,
      forceIncome: rule.forceIncome ?? null,
    })
  })

  if (values.length === 0) {
    console.log("✓ Regras de classificação já estavam no banco")
    return { inserted: 0 }
  }

  await db.insert(classificationRules).values(values)
  console.log(`✓ ${values.length} regra(s) de classificação inserida(s)`)
  return { inserted: values.length }
}

if (import.meta.main) {
  await seedClassificationRules()
  await db.execute(sql`select 1`)
  process.exit(0)
}
