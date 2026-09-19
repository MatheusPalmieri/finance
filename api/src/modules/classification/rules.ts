// Camada 1 — regras determinísticas. Substitui o array DEPARA_RULES que vivia
// no frontend. Match puro em `matchRule()`; o carregamento com cache fica em
// `loadRules()` e é invalidado a cada escrita no CRUD.

import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../db"
import { classificationRules, type ClassificationRule } from "../../db/schema"
import { merchantKey, normalizeDescription } from "./normalize"
import { EMPTY_PATCH, type ClassificationPatch } from "./types"

/** Regex inválida é desabilitada em memória e logada — nunca derruba a importação. */
const brokenRegexIds = new Set<string>()

function compileRegex(rule: ClassificationRule): RegExp | null {
  try {
    return new RegExp(rule.pattern, "i")
  } catch {
    if (!brokenRegexIds.has(rule.id)) {
      brokenRegexIds.add(rule.id)
      console.error(
        `[classification] regex inválida na regra ${rule.id}: ${rule.pattern} — regra ignorada`
      )
    }
    return null
  }
}

/**
 * Ordem de avaliação: prioridade desc, depois pattern mais longo primeiro
 * (o mais específico ganha no empate). Preserva o "ordem importa" do de-para.
 */
export function sortRules(rules: ClassificationRule[]): ClassificationRule[] {
  return [...rules].sort(
    (a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length
  )
}

/**
 * `contains` e `exact` comparam contra DOIS textos: a descrição normalizada e
 * a `merchantKey`.
 *
 * O motivo é que as duas origens de pattern vivem em espaços diferentes: as
 * regras `seed`/`manual` são frases que aparecem na descrição normalizada
 * ("conceito imobiliaria"), enquanto as `learned` nascem de
 * `merchantKey(description)` — sem pontuação, números nem sufixo de loja
 * ("pag barbeariadoze"). Sem esta dupla comparação, toda regra aprendida
 * deixaria de casar com a própria descrição que a criou.
 */
function ruleMatches(
  rule: ClassificationRule,
  normalized: string,
  key: string
): boolean {
  switch (rule.matchType) {
    case "exact": {
      const pattern = normalizeDescription(rule.pattern)
      return normalized === pattern || key === pattern
    }
    case "regex": {
      const regex = compileRegex(rule)
      return regex ? regex.test(normalized) : false
    }
    case "contains":
    default: {
      const pattern = normalizeDescription(rule.pattern)
      return normalized.includes(pattern) || key.includes(pattern)
    }
  }
}

/** Converte a regra no patch que ela aplica. Campos nulos não sobrescrevem nada. */
export function ruleToPatch(rule: ClassificationRule): ClassificationPatch {
  return {
    suggestedName: rule.renameTo,
    categoryId: rule.categoryId,
    paymentMethod: rule.paymentMethod,
    recurrence: rule.recurrence,
    isEssential: rule.isEssential,
    budgetId: rule.budgetId,
    forceIncome: rule.forceIncome,
  }
}

/**
 * Primeira regra habilitada que casa, na ordem de `sortRules`.
 * Função pura — `rules` já vem carregada e ordenada pelo chamador.
 */
export function matchRule(
  rules: ClassificationRule[],
  description: string
): ClassificationRule | null {
  const normalized = normalizeDescription(description)
  const key = merchantKey(description)
  for (const rule of rules) {
    if (!rule.enabled) continue
    if (ruleMatches(rule, normalized, key)) return rule
  }
  return null
}

// ── Cache ─────────────────────────────────────────────────────────────────────
let cache: ClassificationRule[] | null = null

/** Regras habilitadas, já ordenadas. Cache invalidado a cada escrita no CRUD. */
export async function loadRules(): Promise<ClassificationRule[]> {
  if (cache) return cache
  const rows = await db
    .select()
    .from(classificationRules)
    .where(eq(classificationRules.enabled, true))
  cache = sortRules(rows)
  return cache
}

/** Chamado por toda escrita no CRUD de regras. */
export function invalidateRulesCache() {
  cache = null
  brokenRegexIds.clear()
}

/** Telemetria: incrementa `hitCount` e carimba `lastHitAt` das regras que casaram. */
export async function registerHits(ruleIds: string[]) {
  if (ruleIds.length === 0) return
  const unique = [...new Set(ruleIds)]
  await db
    .update(classificationRules)
    .set({
      hitCount: sql`${classificationRules.hitCount} + 1`,
      lastHitAt: new Date(),
    })
    .where(
      and(
        inArray(classificationRules.id, unique),
        eq(classificationRules.enabled, true)
      )
    )
}

/** Valida uma regex antes de gravar a regra. */
export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, "i")
    return true
  } catch {
    return false
  }
}

export { EMPTY_PATCH }
