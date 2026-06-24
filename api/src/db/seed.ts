import { db } from "./index"
import {
  accounts,
  banks,
  budgets,
  categories,
  paymentMethods,
  transactions,
  type NewTransaction,
} from "./schema"

// ── Helpers ──────────────────────────────────────────────────────────────────
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const randFloat = (min: number, max: number) => Number((Math.random() * (max - min) + min).toFixed(2))
const daysAgo = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split("T")[0]
}

// ── Contas ───────────────────────────────────────────────────────────────────
const accountsData = [
  { name: "Conta Corrente Itaú", type: "CHECKING" as const, balance: "8547.32", color: "#f59e0b", icon: "building-bank" },
  { name: "Nubank", type: "CHECKING" as const, balance: "12300.00", color: "#7c3aed", icon: "credit-card", isDefault: true },
  { name: "Cartão XP", type: "CREDIT_CARD" as const, balance: "-2850.00", color: "#ef4444", icon: "credit-card" },
  { name: "Poupança CEF", type: "SAVINGS" as const, balance: "5200.00", color: "#10b981", icon: "piggy-bank" },
  { name: "Renda Fixa", type: "INVESTMENT" as const, balance: "35000.00", color: "#3b82f6", icon: "trending-up" },
]

// ── Categorias ───────────────────────────────────────────────────────────────
// As transações são apenas despesas; estas categorias cobrem os gastos.
const expenseCategoriesData = [
  { name: "Alimentação", color: "#f59e0b" },
  { name: "Moradia", color: "#ef4444" },
  { name: "Transporte", color: "#8b5cf6" },
  { name: "Saúde", color: "#ec4899" },
  { name: "Lazer", color: "#f97316" },
  { name: "Vestuário", color: "#14b8a6" },
  { name: "Educação", color: "#6366f1" },
  { name: "Assinaturas", color: "#a855f7" },
]

// ── Formas de pagamento ────────────────────────────────────────────────────────
const paymentMethodsData = [
  { name: "Dinheiro", color: "#10b981" },
  { name: "Pix", color: "#06b6d4" },
  { name: "Cartão de crédito", color: "#ef4444" },
  { name: "Cartão de débito", color: "#3b82f6" },
  { name: "Boleto", color: "#f59e0b" },
  { name: "Transferência", color: "#8b5cf6" },
]

// ── Bancos ───────────────────────────────────────────────────────────────────
const banksData = [
  { name: "Itaú", color: "#f59e0b" },
  { name: "Nubank", color: "#7c3aed" },
  { name: "Banco do Brasil", color: "#facc15" },
  { name: "Bradesco", color: "#ef4444" },
  { name: "Caixa", color: "#3b82f6" },
  { name: "Inter", color: "#f97316" },
]

// ── Seed ─────────────────────────────────────────────────────────────────────
console.log("Inserindo contas...")
const insertedAccounts = await db.insert(accounts).values(accountsData).returning()

console.log("Inserindo categorias...")
const expenseCategories = await db.insert(categories).values(expenseCategoriesData).returning()

console.log("Inserindo formas de pagamento...")
const insertedPaymentMethods = await db.insert(paymentMethods).values(paymentMethodsData).returning()

console.log("Inserindo bancos...")
await db.insert(banks).values(banksData)

// ── Orçamentos (catálogo 50/30/20) ─────────────────────────────────────────────
// `category` é só para o seed casar transações fixas; não vai para a tabela.
const budgetsSeed = [
  { name: "Aluguel", type: "essential", amountType: "fixed", amount: "2200.00", amountMin: null, amountMax: null, category: "Moradia" },
  { name: "Internet Vivo Fibra", type: "essential", amountType: "fixed", amount: "120.00", amountMin: null, amountMax: null, category: "Moradia" },
  { name: "Conta de Luz", type: "essential", amountType: "variable", amount: null, amountMin: "90.00", amountMax: "260.00", category: "Moradia" },
  { name: "Plano de Saúde", type: "essential", amountType: "fixed", amount: "480.00", amountMin: null, amountMax: null, category: "Saúde" },
  { name: "Academia", type: "desire", amountType: "fixed", amount: "110.00", amountMin: null, amountMax: null, category: "Lazer" },
  { name: "Streaming", type: "desire", amountType: "fixed", amount: "55.00", amountMin: null, amountMax: null, category: "Assinaturas" },
  { name: "Reserva de emergência", type: "investment", amountType: "fixed", amount: "1000.00", amountMin: null, amountMax: null, category: null },
] as const

console.log("Inserindo orçamentos...")
const insertedBudgets = await db
  .insert(budgets)
  .values(budgetsSeed.map(({ category: _category, ...b }) => b))
  .returning()
const budgetByName = new Map(insertedBudgets.map((b) => [b.name, b]))

// Agrupa os orçamentos por categoria (para casar com transações fixas)
const budgetsByCategory = new Map<string, (typeof insertedBudgets)[number][]>()
for (const seed of budgetsSeed) {
  if (!seed.category) continue
  const row = budgetByName.get(seed.name)
  if (!row) continue
  const arr = budgetsByCategory.get(seed.category) ?? []
  arr.push(row)
  budgetsByCategory.set(seed.category, arr)
}

// Perfil de cada categoria de despesa: se é essencial e se há gasto fixo associado
const categoryProfile: Record<string, { essential: boolean }> = {
  Alimentação: { essential: true },
  Moradia: { essential: true },
  Transporte: { essential: true },
  Saúde: { essential: true },
  Lazer: { essential: false },
  Vestuário: { essential: false },
  Educação: { essential: true },
  Assinaturas: { essential: false },
}

// Nomes e faixas de valor para despesas variáveis por categoria
const names: Record<string, string[]> = {
  Alimentação: ["Supermercado Pão de Açúcar", "iFood", "Restaurante Japonês", "Hortifruti", "Mercado Extra"],
  Moradia: ["Conta de Água", "Gás", "Manutenção"],
  Transporte: ["Uber", "Gasolina Posto Shell", "Manutenção carro", "Estacionamento", "99Pop"],
  Saúde: ["Farmácia", "Dentista", "Exames"],
  Lazer: ["Cinema", "Bar com amigos", "Show", "Jogo Steam"],
  Vestuário: ["Shein", "Zara", "Riachuelo"],
  Educação: ["Udemy", "Livros Técnicos", "Alura"],
  Assinaturas: ["Adobe Creative Cloud", "GitHub Copilot", "iCloud+"],
}

const amounts: Record<string, [number, number]> = {
  Alimentação: [50, 450],
  Moradia: [80, 350],
  Transporte: [15, 250],
  Saúde: [30, 400],
  Lazer: [15, 300],
  Vestuário: [80, 500],
  Educação: [20, 200],
  Assinaturas: [15, 120],
}

// ── Transações (despesas dos últimos 90 dias) ───────────────────────────────────
console.log("Inserindo transações...")
const transactionsData: NewTransaction[] = []

for (let day = 0; day < 90; day += randInt(1, 4)) {
  const cat = pick(expenseCategories)
  const catBudgets = budgetsByCategory.get(cat.name)
  const common = {
    categoryId: cat.id,
    paymentMethodId: pick(insertedPaymentMethods).id,
    accountId: pick(insertedAccounts).id,
    date: daysAgo(day),
  }

  // ~40% das transações de categorias com orçamento fixo são gastos fixos vinculados
  if (catBudgets?.length && Math.random() < 0.4) {
    const budget = pick(catBudgets)
    const amount =
      budget.amountType === "fixed"
        ? (budget.amount ?? "0")
        : String(randFloat(Number(budget.amountMin), Number(budget.amountMax)))
    transactionsData.push({
      ...common,
      name: budget.name,
      amount,
      isEssential: budget.type === "essential",
      recurrence: "fixed",
      budgetId: budget.id,
    })
  } else {
    const options = names[cat.name]
    if (!options) continue
    const amtRange = amounts[cat.name] ?? [20, 200]
    const profile = categoryProfile[cat.name] ?? { essential: false }
    transactionsData.push({
      ...common,
      name: pick(options),
      amount: String(randFloat(amtRange[0], amtRange[1])),
      isEssential: profile.essential,
      recurrence: "variable",
      budgetId: null,
    })
  }
}

await db.insert(transactions).values(transactionsData)

console.log("Seed concluída.")
process.exit(0)
