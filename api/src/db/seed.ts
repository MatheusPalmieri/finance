import { db } from "./index"
import { categories } from "./schema"

// ── Seed padrão ──────────────────────────────────────────────────────────────
// Só o catálogo de categorias. Não cria conta, saldo nem transação: tudo isso
// vem do Open Finance — as contas nascem no primeiro sync (`bun run
// sync:pluggy`). Não existe seed de dados fake: a app mostra sempre dado real.

export const categoriesData = [
  { name: "Lazer", color: "#f97316" },
  { name: "Transporte", color: "#8b5cf6" },
  { name: "Estudos", color: "#6366f1" },
  { name: "Investimento", color: "#10b981" },
  { name: "Salário", color: "#84cc16" },
  { name: "Alimentação", color: "#f59e0b" },
  { name: "Office", color: "#64748b" },
  { name: "Saúde", color: "#ec4899" },
  { name: "Compras", color: "#a855f7" },
  { name: "Música", color: "#f43f5e" },
  { name: "Moradia", color: "#ef4444" },
  { name: "Assinaturas", color: "#3b82f6" },
  { name: "Serviços", color: "#14b8a6" },
  // Obrigatória: é a categoria de fallback do sync
  { name: "Outros", color: "#6b7280" },
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
