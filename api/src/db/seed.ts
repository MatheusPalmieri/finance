import { db } from "./index"
import { accounts, categories } from "./schema"

// ── Seed padrão ──────────────────────────────────────────────────────────────
// Configuração de uso real do dia a dia — SEM dados fake de transação.
// Roda sempre que sobe um banco novo (`bun run db:seed`). Editar aqui conforme
// a necessidade real muda (novas contas, categorias). Para popular dados de
// teste em abundância, ver `db:seed:dev` (seed-dev.ts), que reaproveita esta
// função e depois empilha orçamentos/transações fake por cima.

// ── Contas ───────────────────────────────────────────────────────────────────
export const accountsData = [
  { name: "Nubank", type: "CHECKING" as const, balance: "0.00", color: "#7c3aed", icon: "credit-card", isDefault: true },
  { name: "Itaú", type: "CHECKING" as const, balance: "0.00", color: "#f59e0b", icon: "building-bank" },
  { name: "Mercado Pago", type: "CHECKING" as const, balance: "0.00", color: "#06b6d4", icon: "wallet" },
]

// ── Categorias ───────────────────────────────────────────────────────────────
export const categoriesData = [
  { name: "Lazer", color: "#f97316" },
  { name: "Transporte", color: "#8b5cf6" },
  { name: "Estudos", color: "#6366f1" },
  { name: "Investimento", color: "#10b981" },
  { name: "Alimentação", color: "#f59e0b" },
  { name: "Office", color: "#64748b" },
  { name: "Saúde", color: "#ec4899" },
  { name: "Compras", color: "#a855f7" },
  { name: "Música", color: "#f43f5e" },
  { name: "Moradia", color: "#ef4444" },
  { name: "Assinaturas", color: "#3b82f6" },
  { name: "Serviços", color: "#14b8a6" },
  { name: "Outros", color: "#6b7280" },
]

export async function seedBase() {
  console.log("Inserindo contas...")
  const insertedAccounts = await db.insert(accounts).values(accountsData).returning()

  console.log("Inserindo categorias...")
  const insertedCategories = await db.insert(categories).values(categoriesData).returning()

  return { accounts: insertedAccounts, categories: insertedCategories }
}

if (import.meta.main) {
  await seedBase()
  console.log("Seed padrão concluída.")
  process.exit(0)
}
