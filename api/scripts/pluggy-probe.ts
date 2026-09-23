// Sondagem da Pluggy (F0 do plano de Open Finance) — SOMENTE LEITURA.
//
//   bun run pluggy:probe
//
// Não grava nada no banco. Responde, com os dados reais da conta Meu Pluggy,
// as perguntas que definem o desenho do sync (F1–F4):
//
//   1. Quais conexões (items) e contas existem, e em que status.
//   2. Convenção de sinal por tipo de conta: `type` (DEBIT/CREDIT) × sinal de
//      `amount` — no cartão a Pluggy usa positivo = compra.
//   3. Quais campos de enriquecimento vêm preenchidos (category, merchant,
//      creditCardMetadata, paymentData, providerId).
//   4. Janela de histórico real e volume.
//   5. Se dá para conciliar com o histórico CSV já importado: o `providerId`
//      bate com o Identificador do extrato Nubank? Se não, quanto casa por
//      data + valor.
//
// O payload bruto vai para `api/tmp/pluggy-probe.json` (gitignored — é extrato
// bancário). Ver .claude/docs/infra/pluggy-probe.md.

import { mkdir } from "node:fs/promises"
import { eq } from "drizzle-orm"
import { db } from "../src/db"
import { accounts, transactions } from "../src/db/schema"

const BASE_URL = process.env.PLUGGY_BASE_URL ?? "https://api.pluggy.ai"
const HISTORY_MONTHS = 12
// Teto de segurança: 500 transações por página
const MAX_PAGES = 60

function requireEnv(key: string): string {
  const value = process.env[key]?.trim()
  if (!value) {
    console.error(`✗ Variável ausente em api/.env: ${key}`)
    console.error("  Ver api/.env.example (bloco Open Finance).")
    process.exit(1)
  }
  return value
}

const clientId = requireEnv("PLUGGY_CLIENT_ID")
const clientSecret = requireEnv("PLUGGY_CLIENT_SECRET")
const itemIds = requireEnv("PLUGGY_ITEM_IDS")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean)

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    // Corpo de erro da Pluggy não contém credenciais, só código e mensagem
    const body = await res.text().catch(() => "")
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

const { apiKey } = await http<{ apiKey: string }>("/auth", {
  method: "POST",
  body: JSON.stringify({ clientId, clientSecret }),
})
const authed = <T>(path: string) => http<T>(path, { headers: { "X-API-KEY": apiKey } })
console.log("✓ autenticado na Pluggy\n")

// ── Tipos mínimos (só o que a sondagem lê) ───────────────────────────────────

interface PluggyItem {
  id: string
  status?: string
  executionStatus?: string
  lastUpdatedAt?: string | null
  connector?: { id?: number; name?: string; isOpenFinance?: boolean }
  [key: string]: unknown
}

interface PluggyAccount {
  id: string
  type?: string
  subtype?: string
  name?: string
  marketingName?: string | null
  number?: string | null
  balance?: number
  currencyCode?: string
  [key: string]: unknown
}

interface PluggyTransaction {
  id: string
  date: string
  description?: string
  amount: number
  type?: "DEBIT" | "CREDIT"
  status?: string
  category?: string | null
  providerId?: string | null
  merchant?: unknown
  creditCardMetadata?: unknown
  paymentData?: unknown
  [key: string]: unknown
}

async function listAllTransactions(accountId: string, dateFrom: string) {
  const all: PluggyTransaction[] = []
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ accountId, dateFrom })
    if (after) params.set("after", after)
    const res = await authed<{ results: PluggyTransaction[]; next?: string | null }>(
      `/v2/transactions?${params}`
    )
    all.push(...res.results)
    // `next` vem como querystring pronta ("?accountId=...&after=<cursor>")
    after = res.next
      ? new URLSearchParams(res.next.slice(res.next.indexOf("?") + 1)).get("after")
      : null
    if (!after) break
  }
  return all
}

// ── Coleta ───────────────────────────────────────────────────────────────────

const since = new Date()
since.setMonth(since.getMonth() - HISTORY_MONTHS)
const dateFrom = since.toISOString().slice(0, 10)

const raw: { items: unknown[]; accounts: unknown[]; transactions: Record<string, unknown[]> } = {
  items: [],
  accounts: [],
  transactions: {},
}
const allTx: { account: PluggyAccount; tx: PluggyTransaction }[] = []

for (const itemId of itemIds) {
  const item = await authed<PluggyItem>(`/items/${encodeURIComponent(itemId)}`)
  raw.items.push(item)
  console.log(`■ Item ${item.id}`)
  console.log(`  conector: ${item.connector?.name ?? "?"} (id ${item.connector?.id ?? "?"}, Open Finance: ${item.connector?.isOpenFinance ?? "?"})`)
  console.log(`  status: ${item.status} / ${item.executionStatus} — atualizado em ${item.lastUpdatedAt ?? "?"}`)
  console.log(`  campos do item: ${Object.keys(item).sort().join(", ")}`)

  const { results: itemAccounts } = await authed<{ results: PluggyAccount[] }>(
    `/accounts?itemId=${encodeURIComponent(itemId)}`
  )
  raw.accounts.push(...itemAccounts)

  for (const account of itemAccounts) {
    const txs = await listAllTransactions(account.id, dateFrom)
    raw.transactions[account.id] = txs
    for (const tx of txs) allTx.push({ account, tx })
    console.log(
      `  └ conta ${account.type}/${account.subtype} "${account.name}" ` +
        `nº ${account.number ?? "—"} saldo ${account.balance} ${account.currencyCode ?? ""} — ${txs.length} transações`
    )
  }
  console.log()
}

await mkdir("tmp", { recursive: true })
await Bun.write("tmp/pluggy-probe.json", JSON.stringify(raw, null, 2))
console.log("✓ payload bruto salvo em api/tmp/pluggy-probe.json (gitignored)\n")

// ── Análise ──────────────────────────────────────────────────────────────────

function pct(part: number, total: number) {
  return total === 0 ? "—" : `${((part / total) * 100).toFixed(0)}%`
}

console.log("■ Convenção de sinal (tipo de conta × type × sinal de amount)")
const signs = new Map<string, number>()
for (const { account, tx } of allTx) {
  const key = `${account.type}/${tx.type ?? "?"}/${tx.amount < 0 ? "negativo" : "positivo"}`
  signs.set(key, (signs.get(key) ?? 0) + 1)
}
for (const [key, count] of [...signs].sort()) console.log(`  ${key}: ${count}`)

console.log("\n■ Status")
const statuses = new Map<string, number>()
for (const { tx } of allTx) statuses.set(tx.status ?? "?", (statuses.get(tx.status ?? "?") ?? 0) + 1)
for (const [key, count] of statuses) console.log(`  ${key}: ${count}`)

console.log("\n■ Campos de enriquecimento preenchidos")
const fields = ["category", "providerId", "merchant", "creditCardMetadata", "paymentData"] as const
for (const field of fields) {
  const filled = allTx.filter(({ tx }) => tx[field] != null).length
  console.log(`  ${field}: ${filled}/${allTx.length} (${pct(filled, allTx.length)})`)
}
const categories = new Map<string, number>()
for (const { tx } of allTx) if (tx.category) categories.set(tx.category, (categories.get(tx.category) ?? 0) + 1)
console.log(
  `  categorias distintas: ${categories.size} — top: ` +
    [...categories].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => `${c} (${n})`).join(", ")
)

const dates = allTx.map(({ tx }) => tx.date.slice(0, 10)).sort()
console.log(`\n■ Janela real: ${dates[0] ?? "—"} → ${dates[dates.length - 1] ?? "—"} (pedido desde ${dateFrom})`)

// ── Conciliação com o histórico CSV já importado ─────────────────────────────

const nubank = await db.query.accounts.findFirst({ where: eq(accounts.name, "Nubank") })
if (nubank) {
  const csvRows = await db
    .select({ date: transactions.date, amount: transactions.amount, notes: transactions.notes })
    .from(transactions)
    .where(eq(transactions.accountId, nubank.id))

  const csvIds = new Set(
    csvRows.map((r) => r.notes?.match(/Importado via CSV — ID (.+)$/)?.[1]).filter(Boolean)
  )
  // Chave aproximada: data + valor absoluto (o sinal do domínio é invertido)
  const csvKeys = new Set(csvRows.map((r) => `${r.date}|${Math.abs(Number(r.amount)).toFixed(2)}`))

  const bankTx = allTx.filter(({ account }) => account.type === "BANK")
  const byId = bankTx.filter(({ tx }) => csvIds.has(tx.providerId ?? "") || csvIds.has(tx.id)).length
  const byKey = bankTx.filter(({ tx }) =>
    csvKeys.has(`${tx.date.slice(0, 10)}|${Math.abs(tx.amount).toFixed(2)}`)
  ).length

  console.log(`\n■ Conciliação com o CSV (${csvRows.length} linhas na conta Nubank, contas BANK da Pluggy: ${bankTx.length})`)
  console.log(`  por identificador (providerId/id = Identificador do extrato): ${byId} (${pct(byId, bankTx.length)})`)
  console.log(`  por data + valor: ${byKey} (${pct(byKey, bankTx.length)})`)
}

console.log("\n■ Amostra (5 por conta)")
for (const [accountId, txs] of Object.entries(raw.transactions)) {
  console.log(`  conta ${accountId}`)
  for (const tx of (txs as PluggyTransaction[]).slice(0, 5)) {
    console.log(
      `    ${tx.date.slice(0, 10)} ${String(tx.amount).padStart(10)} ${tx.type ?? "?"} ` +
        `${(tx.status ?? "?").padEnd(7)} ${(tx.category ?? "—").slice(0, 20).padEnd(20)} ${(tx.description ?? "").slice(0, 50)}`
    )
  }
}

process.exit(0)
