// Orquestra as três camadas em cascata com early-exit: numa importação típica
// do Nubank, 70–85% das linhas param na camada 1 ou 2 e o LLM vê poucas linhas.

import { and, desc, eq, ilike, or, sql } from "drizzle-orm"
import { db } from "../../db"
import {
  categories,
  classificationRules,
  recurringSeries,
  transactions,
  type ClassificationRule,
  type NewClassificationRule,
  type RecurringStatus,
  type RuleMatchType,
  type RuleSource,
} from "../../db/schema"
import { REAL_TRANSACTIONS } from "../../lib/scope"
import { aiAvailable } from "../llm"
import { classifyWithLlm } from "./llm"
import { knnSuggest, loadKnnIndex } from "./knn"
import { merchantKey, normalizeDescription, pixRecipientName } from "./normalize"
import {
  invalidateRulesCache,
  isValidRegex,
  loadRules,
  matchRule,
  registerHits,
  ruleToPatch,
  sortRules,
} from "./rules"
import {
  monthlyCost,
  priceChangePct,
  recalculate,
  scheduleRecalculate,
} from "./recurring"
import {
  EMPTY_PATCH,
  type SuggestItem,
  type SuggestResult,
  type Suggestion,
} from "./types"

export interface SuggestInput {
  /** `false` pula a camada 3. */
  useAi?: boolean
  items: SuggestItem[]
}

/**
 * Cascata de classificação. Nunca lança por causa da IA: se a camada 3 falhar,
 * as linhas residuais voltam com `source: "none"` e `aiAvailable: false`.
 */
export async function suggest(input: SuggestInput): Promise<SuggestResult> {
  const items = input.items ?? []
  if (items.length === 0) {
    return {
      aiAvailable: false,
      items: [],
      stats: { rule: 0, knn: 0, llm: 0, none: 0, llmLatencyMs: null },
    }
  }

  const rules = await loadRules()
  const byIndex = new Map<number, Suggestion>()
  const hitRuleIds: string[] = []

  // ── Camada 1: regras ───────────────────────────────────────────────────────
  const residualAfterRules: SuggestItem[] = []
  for (const item of items) {
    const rule = matchRule(rules, item.description)
    if (!rule) {
      residualAfterRules.push(item)
      continue
    }
    hitRuleIds.push(rule.id)
    byIndex.set(item.index, {
      ...ruleToPatch(rule),
      index: item.index,
      source: "rule",
      ruleId: rule.id,
      confidence: 1,
    })
  }

  // ── Camada 2: kNN sobre o histórico já classificado ────────────────────────
  const residualAfterKnn: SuggestItem[] = []
  if (residualAfterRules.length > 0) {
    const index = await loadKnnIndex()
    for (const item of residualAfterRules) {
      const match = knnSuggest(index, item.description)
      if (!match) {
        residualAfterKnn.push(item)
        continue
      }
      byIndex.set(item.index, {
        ...match.patch,
        index: item.index,
        source: "knn",
        ruleId: null,
        confidence: Number(match.confidence.toFixed(4)),
      })
    }
  }

  // ── Camada 3: LLM (opcional) ───────────────────────────────────────────────
  let llmLatencyMs: number | null = null
  let aiOk = false

  if (residualAfterKnn.length > 0 && input.useAi !== false) {
    const health = await aiAvailable()
    aiOk = health.available
    if (aiOk) {
      try {
        const catalog = await db
          .select({ id: categories.id, name: categories.name })
          .from(categories)
        const result = await classifyWithLlm(catalog, residualAfterKnn)
        llmLatencyMs = result.latencyMs
        for (const suggestion of result.suggestions) {
          byIndex.set(suggestion.index, suggestion)
        }
      } catch (err) {
        // Degradação obrigatória: sem IA o resto da importação segue igual
        aiOk = false
        console.error(
          "[classification] camada LLM indisponível, seguindo sem ela:",
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  // ── Consolidação ───────────────────────────────────────────────────────────
  const out: Suggestion[] = items.map((item) => {
    const suggestion = byIndex.get(item.index) ?? {
      ...EMPTY_PATCH,
      index: item.index,
      source: "none" as const,
      ruleId: null,
      confidence: 0,
    }
    return {
      ...suggestion,
      // Único renomeador dinâmico herdado do de-para: o destinatário do Pix
      // vem dentro da própria descrição (ver normalize.ts).
      suggestedName: suggestion.suggestedName ?? pixRecipientName(item.description),
    }
  })

  // Telemetria das regras não pode atrasar a resposta nem derrubá-la
  registerHits(hitRuleIds).catch((err) =>
    console.error("[classification] falha ao registrar hits de regra", err)
  )

  const stats = { rule: 0, knn: 0, llm: 0, none: 0, llmLatencyMs }
  for (const suggestion of out) stats[suggestion.source]++

  return { aiAvailable: aiOk, items: out, stats }
}

// ── Feedback: é o que faz o sistema aprender ─────────────────────────────────

export interface FeedbackInput {
  description: string
  categoryId?: string | null
  paymentMethod?: ClassificationRule["paymentMethod"]
  recurrence?: ClassificationRule["recurrence"]
  isEssential?: boolean | null
  renameTo?: string | null
  budgetId?: string | null
  /** `false` só registra a correção, sem criar regra. */
  createRule?: boolean
}

export type FeedbackResult =
  | { ruleId: string; created: boolean }
  | { conflictRuleId: string; message: string }

/**
 * Deriva o pattern do `merchantKey` da descrição corrigida e cria/atualiza a
 * regra `learned`. Regra `seed`/`manual` com o mesmo pattern nunca é
 * sobrescrita — devolve conflito e a UI oferece editar a existente.
 */
export async function feedback(
  input: FeedbackInput
): Promise<FeedbackResult | { message: string }> {
  const pattern = merchantKey(input.description)
  if (!pattern) {
    return { message: "Descrição sem texto aproveitável para virar regra" }
  }

  const [existing] = await db
    .select()
    .from(classificationRules)
    .where(
      and(
        eq(classificationRules.pattern, pattern),
        eq(classificationRules.matchType, "contains")
      )
    )
    .limit(1)

  const values = {
    renameTo: input.renameTo ?? null,
    categoryId: input.categoryId ?? null,
    paymentMethod: input.paymentMethod ?? null,
    recurrence: input.recurrence ?? null,
    isEssential: input.isEssential ?? null,
    budgetId: input.budgetId ?? null,
  }

  if (existing) {
    if (existing.source !== "learned") {
      return {
        conflictRuleId: existing.id,
        message: `Já existe uma regra ${existing.source === "seed" ? "padrão" : "manual"} para "${pattern}"`,
      }
    }
    await db
      .update(classificationRules)
      .set(values)
      .where(eq(classificationRules.id, existing.id))
    invalidateRulesCache()
    return { ruleId: existing.id, created: false }
  }

  if (input.createRule === false) {
    return { message: "Correção registrada sem criar regra" }
  }

  const [created] = await db
    .insert(classificationRules)
    .values({
      ...values,
      pattern,
      matchType: "contains",
      source: "learned",
      priority: 500,
    })
    .returning()

  invalidateRulesCache()
  return { ruleId: created.id, created: true }
}

// ── CRUD de regras ───────────────────────────────────────────────────────────

export interface ListRulesParams {
  search?: string
  source?: RuleSource
  enabled?: boolean
}

export async function listRules(params: ListRulesParams = {}) {
  const conditions = []
  if (params.search) {
    conditions.push(
      or(
        ilike(classificationRules.pattern, `%${params.search}%`),
        ilike(classificationRules.renameTo, `%${params.search}%`)
      )
    )
  }
  if (params.source) conditions.push(eq(classificationRules.source, params.source))
  if (params.enabled !== undefined)
    conditions.push(eq(classificationRules.enabled, params.enabled))

  return db.query.classificationRules.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: { category: true, budget: true },
    orderBy: [
      desc(classificationRules.priority),
      desc(classificationRules.hitCount),
    ],
  })
}

export type RuleInput = Omit<
  NewClassificationRule,
  "id" | "createdAt" | "updatedAt" | "hitCount" | "lastHitAt"
>

function validateRule(input: RuleInput): string | null {
  if (!input.pattern?.trim()) return "Informe o padrão da regra"
  if (input.matchType === "regex" && !isValidRegex(input.pattern)) {
    return "Expressão regular inválida"
  }
  return null
}

export async function createRule(input: RuleInput) {
  const error = validateRule(input)
  if (error) return { message: error }

  const [created] = await db
    .insert(classificationRules)
    .values({ ...input, pattern: input.pattern.trim() })
    .returning()
  invalidateRulesCache()
  return created
}

export async function updateRule(id: string, input: RuleInput) {
  const error = validateRule(input)
  if (error) return { message: error }

  const [updated] = await db
    .update(classificationRules)
    .set({ ...input, pattern: input.pattern.trim() })
    .where(eq(classificationRules.id, id))
    .returning()
  invalidateRulesCache()
  return updated ?? null
}

export async function toggleRule(id: string) {
  const [updated] = await db
    .update(classificationRules)
    .set({ enabled: sql`not ${classificationRules.enabled}` })
    .where(eq(classificationRules.id, id))
    .returning()
  invalidateRulesCache()
  return updated ?? null
}

export async function deleteRule(id: string) {
  const [deleted] = await db
    .delete(classificationRules)
    .where(eq(classificationRules.id, id))
    .returning()
  invalidateRulesCache()
  return !!deleted
}

/** Preview: até 20 transações existentes que a regra casaria. */
export async function testRule(pattern: string, matchType: RuleMatchType) {
  if (!pattern.trim()) return { matches: [], total: 0 }
  if (matchType === "regex" && !isValidRegex(pattern)) {
    return { message: "Expressão regular inválida" }
  }

  const rows = await db
    .select({
      id: transactions.id,
      name: transactions.name,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactions)
    .orderBy(desc(transactions.date))
    .limit(500)

  const probe = sortRules([
    {
      id: "preview",
      pattern,
      matchType,
      source: "manual",
      priority: 0,
      renameTo: null,
      categoryId: null,
      paymentMethod: null,
      recurrence: null,
      isEssential: null,
      forceIncome: null,
      budgetId: null,
      enabled: true,
      hitCount: 0,
      lastHitAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])

  const matches = rows.filter((row) => matchRule(probe, row.name) !== null)
  return { matches: matches.slice(0, 20), total: matches.length }
}

// ── Séries recorrentes ───────────────────────────────────────────────────────

export interface ListRecurringParams {
  status?: RecurringStatus
  includeDismissed?: boolean
}

export async function listRecurring(params: ListRecurringParams = {}) {
  const conditions = []
  if (params.status) conditions.push(eq(recurringSeries.status, params.status))
  if (!params.includeDismissed)
    conditions.push(eq(recurringSeries.dismissed, false))

  const rows = await db.query.recurringSeries.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: { category: true },
    orderBy: [desc(recurringSeries.averageAmount)],
  })

  const data = rows.map((row) => {
    const average = Number(row.averageAmount)
    const change = priceChangePct(Number(row.firstAmount), Number(row.lastAmount))
    return {
      ...row,
      monthlyCostBrl: Number(monthlyCost(average, row.intervalDays).toFixed(2)),
      priceChangePct: change === null ? null : Number((change * 100).toFixed(1)),
      /** Data da primeira cobrança já no valor novo — a série inteira mudou aqui. */
      priceChangeSince: change === null ? null : row.lastChargeDate,
    }
  })

  const totalMonthly = data
    .filter((row) => row.status === "ACTIVE")
    .reduce((sum, row) => sum + row.monthlyCostBrl, 0)

  return { data, totalMonthly: Number(totalMonthly.toFixed(2)) }
}

export async function dismissRecurring(id: string) {
  const [updated] = await db
    .update(recurringSeries)
    .set({ dismissed: true })
    .where(eq(recurringSeries.id, id))
    .returning()
  return updated ?? null
}

export async function recurringTransactions(id: string) {
  const [serie] = await db
    .select()
    .from(recurringSeries)
    .where(eq(recurringSeries.id, id))
    .limit(1)
  if (!serie) return null

  const rows = await db.query.transactions.findMany({
    where: REAL_TRANSACTIONS,
    with: { category: true, account: true },
    orderBy: [desc(transactions.date)],
    limit: 500,
  })

  return {
    serie,
    data: rows.filter((row) => merchantKey(row.name) === serie.merchantKey),
  }
}

export { recalculate, scheduleRecalculate, normalizeDescription, merchantKey }
