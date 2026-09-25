// Reclassifica as transações que caíram no fallback ("Outros") passando-as
// de novo pela cascata (regras → kNN → IA). Só troca a categoria, e só quando
// a cascata devolve uma categoria diferente do fallback.
//
//   bun run reclassify:other --apply     # aplica (sem a flag, só mostra)
//   bun run reclassify:other             # simulação: mostra o que mudaria
//
// Dica: a IA local é lenta no primeiro lote — suba `LLM_TIMEOUT_MS` (ex.: 300000).

import { and, eq } from "drizzle-orm"
import { db } from "../src/db"
import { categories, transactions } from "../src/db/schema"
import { suggest } from "../src/modules/classification/service"

const dryRun = !process.argv.includes("--apply")
const BATCH = 40

const [fallback] = await db
  .select({ id: categories.id })
  .from(categories)
  .where(eq(categories.name, "Outros"))
if (!fallback) {
  console.error('✗ Categoria "Outros" não existe')
  process.exit(1)
}

const rows = await db
  .select({ id: transactions.id, name: transactions.name, date: transactions.date, amount: transactions.amount })
  .from(transactions)
  .where(and(eq(transactions.categoryId, fallback.id), eq(transactions.kind, "regular")))

console.log(`${rows.length} transações em "Outros" para reclassificar\n`)

const names = new Map((await db.select().from(categories)).map((c) => [c.id, c.name]))
const changes: { id: string; categoryId: string }[] = []
const bySource = { rule: 0, knn: 0, llm: 0 }

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  const result = await suggest({
    useAi: true,
    items: chunk.map((r, index) => ({
      index,
      description: r.name,
      date: r.date,
      amount: Number(r.amount),
    })),
  })
  console.log(`lote ${i / BATCH + 1}: IA ${result.aiAvailable ? "ok" : "indisponível"}`)
  for (const s of result.items) {
    if (!s.categoryId || s.categoryId === fallback.id || s.source === "none") continue
    changes.push({ id: chunk[s.index].id, categoryId: s.categoryId })
    bySource[s.source]++
    console.log(`  ${chunk[s.index].name} → ${names.get(s.categoryId)} (${s.source}, ${s.confidence})`)
  }
}

console.log(`\n${changes.length} mudam de categoria`, bySource)
if (!dryRun) {
  for (const c of changes) {
    await db.update(transactions).set({ categoryId: c.categoryId }).where(eq(transactions.id, c.id))
  }
  console.log("✓ aplicado")
}
process.exit(0)
