import type { PaymentMethod } from "../../db/schema"

/** Qual camada produziu a sugestão. */
export type SuggestionSource = "rule" | "knn" | "llm" | "none"

/**
 * Campos que uma camada pode preencher numa transação nova do sync. A categoria
 * decide o resto: grupo 50/30/20 e orçamento vêm dela.
 */
export interface ClassificationPatch {
  suggestedName: string | null
  categoryId: string | null
  paymentMethod: PaymentMethod | null
}

export interface Suggestion extends ClassificationPatch {
  index: number
  source: SuggestionSource
  ruleId: string | null
  /** 1 para regra determinística; similaridade no kNN; teto de 0,9 no LLM. */
  confidence: number
}

export interface SuggestItem {
  index: number
  description: string
}

export interface SuggestStats {
  rule: number
  knn: number
  llm: number
  none: number
  llmLatencyMs: number | null
}

export interface SuggestResult {
  aiAvailable: boolean
  items: Suggestion[]
  stats: SuggestStats
}

export const EMPTY_PATCH: ClassificationPatch = {
  suggestedName: null,
  categoryId: null,
  paymentMethod: null,
}
