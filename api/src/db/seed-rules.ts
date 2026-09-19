// Seed das regras de classificação migradas do antigo
// `app/src/pages/Transactions/depara.ts`.
//
// A ordem do array original virava a precedência do match; aqui ela vira
// `priority`, começando em 900 e caindo de 100 em 100 — preserva o comentário
// "ordem importa" do arquivo original.
//
// `categoryName` é resolvido por nome exato; se a categoria não existir, a
// regra entra com `categoryId: null` (mesmo comportamento tolerante de antes).
//
// Idempotente: roda quantas vezes quiser, nunca duplica nem sobrescreve o que
// o usuário editou (só insere o que falta).

import { eq, sql } from "drizzle-orm"
import { db } from "."
import {
  categories,
  classificationRules,
  type NewClassificationRule,
  type PaymentMethod,
  type Recurrence,
} from "./schema"

interface SeedRule {
  pattern: string
  renameTo?: string
  paymentMethod?: PaymentMethod
  categoryName?: string
  /** Força o sinal, ignorando o do extrato. */
  forceIncome?: boolean
  recurrence?: Recurrence
}

// Mesma ordem do DEPARA_RULES original: específicas antes das genéricas.
export const SEED_RULES: SeedRule[] = [
  {
    pattern: "aplicacao rdb",
    paymentMethod: "transfer",
    categoryName: "Investimento",
    forceIncome: true,
    recurrence: "variable",
  },
  {
    pattern: "transferencia recebida - matheus andre palmieri ltda",
    renameTo: "Salário",
    paymentMethod: "transfer",
    categoryName: "Salário",
  },
  {
    pattern: "conceito imobiliaria",
    renameTo: "Aluguel",
    paymentMethod: "boleto",
    categoryName: "Moradia",
  },
  {
    pattern: "celesc distribuicao",
    renameTo: "Conta de luz",
    paymentMethod: "boleto",
    categoryName: "Moradia",
  },
  {
    pattern: "aymore credito",
    renameTo: "Financiamento do carro",
    paymentMethod: "boleto",
    categoryName: "Transporte",
  },
  {
    pattern: "alles imoveis",
    renameTo: "Aluguel",
    paymentMethod: "boleto",
    categoryName: "Moradia",
  },
  {
    pattern: "edificio ilha de cozumel",
    renameTo: "Condomínio",
    paymentMethod: "boleto",
    categoryName: "Moradia",
  },
  {
    pattern: "resgate rdb",
    paymentMethod: "transfer",
    categoryName: "Investimento",
    recurrence: "variable",
  },
  {
    // Rendimento em centavos, vem várias vezes por mês
    pattern: "credito em conta",
    renameTo: "Rendimento",
    paymentMethod: "transfer",
    categoryName: "Investimento",
  },
  // Compra/venda de ativos na corretora do Nubank — nome mantém o ticker
  ...[
    "compra de fii",
    "compra de acoes",
    "compra de bdr",
    "compra de etf",
    "compra de criptomoedas",
    "venda de criptomoedas",
  ].map(
    (pattern): SeedRule => ({
      pattern,
      paymentMethod: "transfer",
      categoryName: "Investimento",
    })
  ),
  { pattern: "compra no debito", paymentMethod: "debit_card" },
  { pattern: "pagamento de fatura", paymentMethod: "credit_card" },
  { pattern: "matheus andre palmieri ltda", paymentMethod: "transfer" },
  { pattern: "matheus andre palmieri", paymentMethod: "transfer" },
  {
    // O nome ("Pix para FULANO") é derivado da própria descrição em
    // normalize.ts — não cabe num renameTo fixo.
    pattern: "transferencia enviada pelo pix",
    paymentMethod: "pix",
  },
]

const PRIORITY_START = 900
// Passo de 10 (e não de 100): são ~21 regras, e um passo de 100 levaria as
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

  const values: NewClassificationRule[] = []
  SEED_RULES.forEach((rule, i) => {
    if (existingPatterns.has(rule.pattern)) return
    values.push({
      pattern: rule.pattern,
      matchType: "contains",
      source: "seed",
      priority: PRIORITY_START - i * PRIORITY_STEP,
      renameTo: rule.renameTo ?? null,
      categoryId: rule.categoryName
        ? (categoryByName.get(rule.categoryName.toLowerCase()) ?? null)
        : null,
      paymentMethod: rule.paymentMethod ?? null,
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
