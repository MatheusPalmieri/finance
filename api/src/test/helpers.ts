// Ferramentas dos testes de integração: reset do banco, fábricas de dados e um
// cliente HTTP que exercita o Elysia por `app.handle()` — sem abrir porta.

import { sql } from "drizzle-orm"
import { createApp } from "../app"
import { db } from "../db"
import {
  accounts,
  budgets,
  categories,
  transactions,
  wallets,
  type AccountType,
  type BudgetType,
  type PaymentMethod,
  type Recurrence,
} from "../db/schema"
import { __setLlm } from "../modules/llm/provider"
import { MockLlmProvider } from "../modules/llm/providers/mock"
import { invalidateRulesCache } from "../modules/classification/rules"

// ── Cliente HTTP ─────────────────────────────────────────────────────────────

const app = createApp()

export interface ApiResponse<T = unknown> {
  status: number
  body: T
}

async function send<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  )

  const text = await response.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // Mantém o texto cru: um corpo não-JSON já é o sintoma a investigar
  }

  return { status: response.status, body: parsed as T }
}

export const api = {
  get: <T = unknown>(path: string) => send<T>("GET", path),
  post: <T = unknown>(path: string, body?: unknown) =>
    send<T>("POST", path, body ?? {}),
  put: <T = unknown>(path: string, body: unknown) => send<T>("PUT", path, body),
  patch: <T = unknown>(path: string, body?: unknown) =>
    send<T>("PATCH", path, body ?? {}),
  delete: <T = unknown>(path: string) => send<T>("DELETE", path),
}

// ── Reset ────────────────────────────────────────────────────────────────────

// Filhas antes das mães: a ordem substitui o CASCADE.
const TABLES_IN_DELETE_ORDER = [
  "transactions",
  "classification_rules",
  "recurring_series",
  "monthly_reports",
  "llm_calls",
  "app_settings",
  "budgets",
  "categories",
  "accounts",
  "wallets",
] as const

/**
 * Esvazia todas as tabelas de dados entre os testes.
 *
 * Usa `DELETE`, e não `TRUNCATE`, de propósito: `TRUNCATE` exige
 * `ACCESS EXCLUSIVE` e fica na fila atrás de **qualquer** escrita ainda em voo
 * — inclusive a telemetria que o app dispara sem esperar (`registerHits`, o
 * insert em `llm_calls`). Com `TRUNCATE`, uma escrita pendente trava a suíte
 * inteira sem dizer por quê.
 *
 * O `lock_timeout` é a rede de segurança: se ainda assim houver contenção, o
 * teste falha em 5s com o erro do Postgres em vez de pendurar.
 */
export async function resetDatabase() {
  // Nível de sessão (não `SET LOCAL`, que exige transação e seria ignorado aqui)
  await db.execute(sql`set lock_timeout = '5s'`)
  for (const table of TABLES_IN_DELETE_ORDER) {
    await db.execute(sql.raw(`delete from "${table}"`))
  }
  // O motor de regras mantém as regras habilitadas em memória
  invalidateRulesCache()
}

// ── Provedor de IA dos testes ────────────────────────────────────────────────

/**
 * Instala um `MockLlmProvider` e devolve a instância, para o teste enfileirar
 * respostas. Lembre de `__setLlm(null)` no teardown.
 */
export function useMockLlm(...responses: (string | Error)[]) {
  const mock = new MockLlmProvider().push(...responses)
  __setLlm(mock)
  return mock
}

export { __setLlm }

/**
 * Espera que a promessa rejeite e devolve o erro.
 *
 * Usamos isto em vez de `expect(p).rejects.*` porque essa forma trava o runner
 * de forma reprodutível quando a rejeição vem depois de chamadas assíncronas ao
 * banco (a promessa fica pendente até o timeout do teste). O `try/catch` é
 * determinístico e não depende do comportamento interno do runner.
 */
export async function expectRejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (err) {
    return err as Error
  }
  throw new Error("Esperava uma rejeição, mas a promessa resolveu")
}

/** Executa um bloco com a IA desligada, restaurando o valor anterior depois. */
export async function withAiDisabled<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.LLM_ENABLED
  process.env.LLM_ENABLED = "false"
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.LLM_ENABLED
    else process.env.LLM_ENABLED = previous
  }
}

// ── Fábricas ─────────────────────────────────────────────────────────────────

export async function makeWallet(name = "Carteira teste", color = "#10b981") {
  const [row] = await db.insert(wallets).values({ name, color }).returning()
  return row
}

export async function makeCategory(name: string, color = "#6366f1") {
  const [row] = await db.insert(categories).values({ name, color }).returning()
  return row
}

export async function makeAccount(
  name = "Conta teste",
  options: { type?: AccountType; balance?: number; isDefault?: boolean } = {}
) {
  const [row] = await db
    .insert(accounts)
    .values({
      name,
      type: options.type ?? "CHECKING",
      balance: String(options.balance ?? 0),
      isDefault: options.isDefault ?? false,
    })
    .returning()
  return row
}

export async function makeBudget(
  name: string,
  options: {
    type?: BudgetType
    amount?: number
    amountMin?: number
    amountMax?: number
  } = {}
) {
  const isRange = options.amountMin !== undefined
  const [row] = await db
    .insert(budgets)
    .values({
      name,
      type: options.type ?? "essential",
      amountType: isRange ? "variable" : "fixed",
      amount: isRange ? null : String(options.amount ?? 0),
      amountMin: isRange ? String(options.amountMin) : null,
      amountMax: isRange ? String(options.amountMax ?? 0) : null,
    })
    .returning()
  return row
}

export interface TransactionSeed {
  name: string
  /** Convenção do domínio: positivo = despesa, negativo = entrada. */
  amount: number
  date: string
  categoryId: string
  accountId: string
  walletId?: string | null
  paymentMethod?: PaymentMethod
  recurrence?: Recurrence
  isEssential?: boolean
  budgetId?: string | null
}

export async function makeTransaction(seed: TransactionSeed) {
  const [row] = await db
    .insert(transactions)
    .values({
      name: seed.name,
      amount: String(seed.amount),
      date: seed.date,
      categoryId: seed.categoryId,
      accountId: seed.accountId,
      walletId: seed.walletId ?? null,
      paymentMethod: seed.paymentMethod ?? "credit_card",
      recurrence: seed.recurrence ?? "variable",
      isEssential: seed.isEssential ?? false,
      budgetId: seed.budgetId ?? null,
    })
    .returning()
  return row
}

/** Insere várias transações de uma vez, preservando a ordem. */
export async function makeTransactions(seeds: TransactionSeed[]) {
  const out = []
  for (const seed of seeds) out.push(await makeTransaction(seed))
  return out
}

// ── Datas ────────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" com deslocamento em meses a partir de hoje. */
export function monthsAgo(months: number, day = 15): string {
  const now = new Date()
  const zeroBased = now.getFullYear() * 12 + now.getMonth() - months
  const year = Math.floor(zeroBased / 12)
  const month = (zeroBased % 12) + 1
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Par (mês, ano) com deslocamento em meses a partir de hoje. */
export function monthOffset(months: number): { month: number; year: number } {
  const now = new Date()
  const zeroBased = now.getFullYear() * 12 + now.getMonth() - months
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 }
}
