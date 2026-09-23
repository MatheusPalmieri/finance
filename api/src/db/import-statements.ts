// ── Importador de extratos CSV pela linha de comando ─────────────────────────
// Mesmo caminho do ImportModal (parse → classificação em 3 camadas → bulk),
// só que sem UI: serve para carregar vários extratos de uma vez.
//
//   bun run import:csv <conta> <arquivo.csv> [...]
//
// Idempotente: pula linhas cujo identificador do extrato já esteja em `notes`
// (mesma marca que o ImportModal grava). Não mexe no saldo das contas — o
// saldo é patrimônio, o extrato é fluxo.

import { eq } from "drizzle-orm"
import { db } from "./index"
import { accounts, categories, transactions, type NewTransaction } from "./schema"
import { suggest } from "../modules/classification/service"

interface StatementRow {
  date: string // ISO yyyy-mm-dd
  amount: number // sinal do extrato: positivo = entrada, negativo = saída
  name: string
  identifier: string
}

// Parser CSV (RFC4180) — espelha `app/src/pages/Transactions/csv.ts`
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += char
      continue
    }
    if (char === '"') inQuotes = true
    else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\r") {
      // ignora — o \n do CRLF fecha a linha
    } else if (char === "\n") {
      row.push(field)
      if (row.some((f) => f !== "")) rows.push(row)
      row = []
      field = ""
    } else field += char
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    if (row.some((f) => f !== "")) rows.push(row)
  }
  return rows
}

function toIsoDate(br: string): string | null {
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, day, month, year] = m
  return `${year}-${month}-${day}`
}

function parseStatementCsv(text: string): StatementRow[] {
  const rows = parseCsv(text.replace(/^﻿/, ""))
  if (rows.length < 2) throw new Error("Arquivo vazio ou sem linhas de dados.")

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const dateIdx = header.findIndex((h) => h === "data")
  const amountIdx = header.findIndex((h) => h === "valor")
  const idIdx = header.findIndex((h) => h.startsWith("identificador"))
  const descIdx = header.findIndex((h) => h.startsWith("descri"))

  if (dateIdx === -1 || amountIdx === -1 || descIdx === -1) {
    throw new Error('Cabeçalho não reconhecido. Esperado "Data", "Valor" e "Descrição".')
  }

  return rows.slice(1).map((cols, i) => {
    const iso = toIsoDate(cols[dateIdx] ?? "")
    if (!iso) throw new Error(`Data inválida na linha ${i + 2}: "${cols[dateIdx] ?? ""}"`)
    const amount = Number(cols[amountIdx])
    if (Number.isNaN(amount) || amount === 0) {
      throw new Error(`Valor inválido na linha ${i + 2}: "${cols[amountIdx] ?? ""}"`)
    }
    return {
      date: iso,
      amount,
      name: (cols[descIdx] ?? "").trim() || "Sem descrição",
      identifier: idIdx !== -1 ? (cols[idIdx] ?? "").trim() : "",
    }
  })
}

// ── Execução ─────────────────────────────────────────────────────────────────
const [accountName, ...files] = process.argv.slice(2)

if (!accountName || files.length === 0) {
  console.error("Uso: bun run import:csv <conta> <arquivo.csv> [...]")
  process.exit(1)
}

const account = await db.query.accounts.findFirst({ where: eq(accounts.name, accountName) })
if (!account) throw new Error(`Conta "${accountName}" não encontrada.`)

// Categoria de escape para o que nenhuma camada classificar
const fallbackCategory = await db.query.categories.findFirst({
  where: eq(categories.name, "Outros"),
})
if (!fallbackCategory) throw new Error('Categoria "Outros" não encontrada.')

// Identificadores já importados — a marca que o ImportModal grava em `notes`
const existing = await db.select({ notes: transactions.notes }).from(transactions)
const importedIds = new Set(
  existing
    .map((t) => t.notes?.match(/Importado via CSV — ID (.+)$/)?.[1])
    .filter((id): id is string => !!id)
)

const parsed: StatementRow[] = []
for (const file of files) {
  const rows = parseStatementCsv(await Bun.file(file).text())
  const novas = rows.filter((r) => !r.identifier || !importedIds.has(r.identifier))
  console.log(`${file}: ${rows.length} linhas, ${rows.length - novas.length} já importadas`)
  for (const r of novas) {
    // Dedupe também dentro do próprio lote (extratos podem se sobrepor)
    if (r.identifier && importedIds.has(r.identifier)) continue
    if (r.identifier) importedIds.add(r.identifier)
    parsed.push(r)
  }
}

if (parsed.length === 0) {
  console.log("Nada novo para importar.")
  process.exit(0)
}

console.log(`\nClassificando ${parsed.length} linhas (regras → histórico → IA)...`)
const result = await suggest({
  items: parsed.map((r, i) => ({
    index: i,
    description: r.name,
    date: r.date,
    amount: r.amount,
  })),
})
console.log(
  `  regra: ${result.stats.rule} | histórico: ${result.stats.knn} | ` +
    `IA: ${result.stats.llm} | sem classificação: ${result.stats.none}` +
    (result.aiAvailable ? "" : "  (IA indisponível)")
)

const byIndex = new Map(result.items.map((s) => [s.index, s]))

const values: NewTransaction[] = parsed.map((r, i) => {
  const s = byIndex.get(i)
  // `forceIncome` sobrepõe o sinal do extrato (caso "Aplicação RDB")
  const isIncome = s?.forceIncome ?? r.amount > 0
  const magnitude = Math.abs(r.amount)
  return {
    name: s?.suggestedName ?? r.name,
    // Convenção do domínio: positivo = despesa, negativo = entrada
    amount: String(isIncome ? -magnitude : magnitude),
    categoryId: s?.categoryId ?? fallbackCategory.id,
    paymentMethod: s?.paymentMethod ?? "pix",
    accountId: account.id,
    // Entrada nunca é essencial; na saída, vale o que a classificação disse
    isEssential: isIncome ? false : (s?.isEssential ?? false),
    recurrence: s?.recurrence ?? "variable",
    budgetId: null,
    date: r.date,
    notes: r.identifier ? `Importado via CSV — ID ${r.identifier}` : null,
    source: "csv",
  }
})

// Lote único: se uma linha falhar, nenhuma entra
await db.transaction(async (tx) => {
  await tx.insert(transactions).values(values)
})

console.log(`\n${values.length} transações importadas em "${accountName}".`)
process.exit(0)
