import { eq } from "drizzle-orm"
import { db } from "./index"
import { accounts, budgets, transactions, type NewTransaction } from "./schema"
import { PAYMENT_METHODS } from "../lib/payment-methods"
import { seedBase } from "./seed"

// ── Seed de desenvolvimento ──────────────────────────────────────────────────
// Roda `seedBase()` (mesmas contas/categorias do seed padrão) e empilha
// orçamentos + ~90 dias de transações fake por cima, pra ter dados em
// abundância pra testar a UI. Não é pra rodar num ambiente "de verdade" —
// é só pra dev (`bun run db:seed:dev`).

// ── Helpers ──────────────────────────────────────────────────────────────────
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const randFloat = (min: number, max: number) => Number((Math.random() * (max - min) + min).toFixed(2))
const daysAgo = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split("T")[0]
}

console.log("Seed de desenvolvimento — populando dados de teste...")

const { accounts: insertedAccounts, categories: insertedCategories } = await seedBase()

// Saldos fake só pra ter algo visível nos cards/dashboard — o seed padrão sobe com 0.00
const fakeBalances: Record<string, string> = {
  Nubank: "8547.32",
  Itaú: "3200.00",
  "Mercado Pago": "1250.90",
}
console.log("Ajustando saldos fake das contas...")
await Promise.all(
  insertedAccounts.map((a) =>
    fakeBalances[a.name]
      ? db.update(accounts).set({ balance: fakeBalances[a.name] }).where(eq(accounts.id, a.id))
      : Promise.resolve()
  )
)

// ── Orçamentos (catálogo 50/30/20) ─────────────────────────────────────────────
// `category` é só para o seed casar transações fixas; não vai para a tabela.
const budgetsSeed = [
  { name: "Aluguel", type: "essential", amountType: "fixed", amount: "2200.00", amountMin: null, amountMax: null, category: "Moradia" },
  { name: "Internet Vivo Fibra", type: "essential", amountType: "fixed", amount: "120.00", amountMin: null, amountMax: null, category: "Moradia" },
  { name: "Conta de Luz", type: "essential", amountType: "variable", amount: null, amountMin: "90.00", amountMax: "260.00", category: "Moradia" },
  { name: "Plano de Saúde", type: "essential", amountType: "fixed", amount: "480.00", amountMin: null, amountMax: null, category: "Saúde" },
  { name: "Academia", type: "desire", amountType: "fixed", amount: "110.00", amountMin: null, amountMax: null, category: "Lazer" },
  { name: "Streaming", type: "desire", amountType: "fixed", amount: "55.00", amountMin: null, amountMax: null, category: "Assinaturas" },
  { name: "Reserva de emergência", type: "investment", amountType: "fixed", amount: "1000.00", amountMin: null, amountMax: null, category: "Investimento" },
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

// Perfil de cada categoria: se é gasto essencial
const categoryProfile: Record<string, { essential: boolean }> = {
  Lazer: { essential: false },
  Transporte: { essential: true },
  Estudos: { essential: true },
  Investimento: { essential: false },
  Alimentação: { essential: true },
  Office: { essential: false },
  Saúde: { essential: true },
  Compras: { essential: false },
  Música: { essential: false },
  Moradia: { essential: true },
  Assinaturas: { essential: false },
  Serviços: { essential: false },
  Outros: { essential: false },
}

// Nomes de despesas variáveis por categoria
const names: Record<string, string[]> = {
  Lazer: ["Cinema", "Bar com amigos", "Show", "Jogo Steam", "Parque de diversões"],
  Transporte: ["Uber", "Gasolina Posto Shell", "Manutenção carro", "Estacionamento", "99Pop"],
  Estudos: ["Udemy", "Livros técnicos", "Alura", "Curso de inglês", "Material escolar"],
  Investimento: ["Aporte Tesouro Direto", "Aporte CDB", "Aporte em ações", "Aporte fundo imobiliário"],
  Alimentação: ["Supermercado Pão de Açúcar", "iFood", "Restaurante Japonês", "Hortifruti", "Mercado Extra"],
  Office: ["Material de escritório", "Assinatura Notion", "Cadeira ergonômica", "Monitor"],
  Saúde: ["Farmácia", "Dentista", "Exames", "Consulta médica"],
  Compras: ["Shein", "Zara", "Riachuelo", "Amazon", "Mercado Livre"],
  Música: ["Show de música", "Instrumento musical", "Aula de violão", "Ingresso festival"],
  Moradia: ["Conta de Água", "Gás", "Manutenção", "Material de limpeza"],
  Assinaturas: ["Adobe Creative Cloud", "GitHub Copilot", "iCloud+", "Spotify", "Amazon Prime"],
  Serviços: ["Encanador", "Eletricista", "Diarista", "Lavanderia"],
  Outros: ["Presente", "Doação", "Imprevisto"],
}

// Faixas de valor por categoria
const amounts: Record<string, [number, number]> = {
  Lazer: [15, 300],
  Transporte: [15, 250],
  Estudos: [20, 200],
  Investimento: [100, 1500],
  Alimentação: [50, 450],
  Office: [20, 300],
  Saúde: [30, 400],
  Compras: [50, 500],
  Música: [20, 250],
  Moradia: [80, 350],
  Assinaturas: [15, 120],
  Serviços: [50, 300],
  Outros: [10, 150],
}

// ── Transações (despesas dos últimos 90 dias) ───────────────────────────────────
console.log("Inserindo transações...")
const transactionsData: NewTransaction[] = []

for (let day = 0; day < 90; day += randInt(1, 4)) {
  const cat = pick(insertedCategories)
  const catBudgets = budgetsByCategory.get(cat.name)
  const common = {
    categoryId: cat.id,
    paymentMethod: pick(PAYMENT_METHODS),
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

console.log(`Seed de desenvolvimento concluída (${transactionsData.length} transações).`)
process.exit(0)
