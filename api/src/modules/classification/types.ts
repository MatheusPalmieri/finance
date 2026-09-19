import type {
  PaymentMethod,
  Recurrence,
} from "../../db/schema"

/** Qual camada produziu a sugestão. */
export type SuggestionSource = "rule" | "knn" | "llm" | "none"

/** Campos que uma camada pode preencher numa linha da importação. */
export interface ClassificationPatch {
  suggestedName: string | null
  categoryId: string | null
  paymentMethod: PaymentMethod | null
  recurrence: Recurrence | null
  isEssential: boolean | null
  budgetId: string | null
  /** Força o sinal, ignorando o do extrato (caso "Aplicação RDB"). */
  forceIncome: boolean | null
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
  /** Usado pelo detector de recorrência — nunca é repassado ao LLM. */
  date?: string
  /** Idem. */
  amount?: number
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
  recurrence: null,
  isEssential: null,
  budgetId: null,
  forceIncome: null,
}
