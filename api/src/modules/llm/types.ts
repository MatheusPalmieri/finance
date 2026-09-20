import type { ZodType } from "zod"

export type LlmRole = "system" | "user" | "assistant"

export interface LlmMessage {
  role: LlmRole
  content: string
}

export interface LlmUsage {
  inputTokens: number
  outputTokens: number
  /** Custo estimado em BRL. Zero nos provedores locais. */
  estimatedCostBrl: number
}

export interface LlmTextRequest {
  system?: string
  messages: LlmMessage[]
  maxTokens?: number
  /** 0 = determinístico. Default 0 para classificação, 0.4 para narrativa. */
  temperature?: number
  /**
   * Timeout desta chamada, em ms. Sobrescreve `LLM_TIMEOUT_MS` e é aplicado
   * **por tentativa** — chamadas pesadas e raras (a narrativa mensal) pedem mais
   * tempo que uma classificação de lote.
   */
  timeoutMs?: number
  /** Cancelamento externo. Quando presente, tem precedência sobre `timeoutMs`. */
  signal?: AbortSignal
}

export interface LlmJsonRequest<T> extends LlmTextRequest {
  /** Schema zod que valida a saída. A chamada falha se não bater. */
  schema: ZodType<T>
  /** Quantas vezes reenviar pedindo correção quando o parse/validação falha. */
  retries?: number
}

export interface LlmResult<T> {
  data: T
  usage: LlmUsage
  /** Nome do provedor que respondeu — vai para o log e para a UI. */
  provider: string
  model: string
  latencyMs: number
}

/** Erro tipado do módulo — permite ao chamador degradar sem inspecionar texto. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "unavailable" // provedor fora do ar / timeout
      | "invalid_output" // respondeu, mas não passou no schema após os retries
      | "config" = "unavailable"
  ) {
    super(message)
    this.name = "LlmError"
  }
}
