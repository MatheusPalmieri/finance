import { db } from "./index"
import { categories, type NewCategory } from "./schema"

// ── Seed padrão ──────────────────────────────────────────────────────────────
// Só o catálogo de categorias. Não cria conta, saldo nem transação: tudo isso
// vem do Open Finance — as contas nascem no primeiro sync (`bun run
// sync:pluggy`). Não existe seed de dados fake: a app mostra sempre dado real.
//
// `group` é o grupo 50/30/20 dos gastos da categoria — ponto de partida,
// ajustável na tela de Orçamentos. Salário é entrada: o grupo não pesa.

export const categoriesData: NewCategory[] = [
  { name: "Moradia", color: "#ef4444", group: "essential" },
  { name: "Mercado", color: "#eab308", group: "essential" },
  { name: "Transporte", color: "#8b5cf6", group: "essential" },
  { name: "Saúde", color: "#ec4899", group: "essential" },
  { name: "Estudos", color: "#6366f1", group: "essential" },
  { name: "Serviços", color: "#14b8a6", group: "essential" },
  { name: "Alimentação", color: "#f59e0b", group: "variable" },
  { name: "Lazer", color: "#f97316", group: "variable" },
  { name: "Compras", color: "#a855f7", group: "variable" },
  { name: "Assinaturas", color: "#3b82f6", group: "variable" },
  { name: "Música", color: "#f43f5e", group: "variable" },
  { name: "Office", color: "#64748b", group: "variable" },
  { name: "Investimento", color: "#10b981", group: "investment" },
  { name: "Salário", color: "#84cc16", group: "variable" },
  // Obrigatória: é a categoria de fallback do sync
  { name: "Outros", color: "#6b7280", group: "variable" },
]

export async function seedBase() {
  console.log("Inserindo categorias...")
  const insertedCategories = await db.insert(categories).values(categoriesData).returning()
  return { categories: insertedCategories }
}

if (import.meta.main) {
  await seedBase()
  console.log("Seed padrão concluída.")
  process.exit(0)
}
