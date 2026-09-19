import { parseJson } from "./json"
import { log } from "./log"
import {
  LlmError,
  type LlmJsonRequest,
  type LlmResult,
  type LlmTextRequest,
  type LlmUsage,
} from "./types"

/**
 * Contrato do provedor de LLM. Trocar Ollama por Anthropic (ou outro) é
 * implementar esta interface e registrá-la em `getLlm()`.
 *
 * O LLM nunca calcula: classifica em lista fechada, narra um JSON já apurado
 * ou traduz frase em parâmetros. Ver `.claude/docs/specs/00-llm-provider.md`.
 */
export interface LlmProvider {
  readonly name: string
  readonly model: string
  /** Texto livre — usado só pela narrativa do check-up mensal. */
  complete(req: LlmTextRequest): Promise<LlmResult<string>>
  /** Saída estruturada validada por zod — classificação e cenários. */
  completeJson<T>(req: LlmJsonRequest<T>): Promise<LlmResult<T>>
  /** Ping rápido (< 2s) — a UI usa para mostrar "IA indisponível". */
  health(): Promise<{ ok: boolean; detail?: string }>
}

/** Resposta crua de um adapter, antes da validação de schema. */
export interface RawCompletion {
  text: string
  usage: LlmUsage
}

/**
 * Base compartilhada pelos adapters: implementa `completeJson` em cima de
 * `chat()` com o laço de reenvio pedindo correção quando o parse/zod falha.
 */
export abstract class BaseLlmProvider implements LlmProvider {
  abstract readonly name: string
  abstract readonly model: string

  /** Chamada bruta ao provedor. `jsonMode` liga o modo JSON nativo quando há. */
  protected abstract chat(
    req: LlmTextRequest,
    jsonMode: boolean
  ): Promise<RawCompletion>

  abstract health(): Promise<{ ok: boolean; detail?: string }>

  async complete(req: LlmTextRequest): Promise<LlmResult<string>> {
    const startedAt = Date.now()
    const raw = await this.chat(req, false)
    return {
      data: raw.text,
      usage: raw.usage,
      provider: this.name,
      model: this.model,
      latencyMs: Date.now() - startedAt,
    }
  }

  async completeJson<T>(req: LlmJsonRequest<T>): Promise<LlmResult<T>> {
    const startedAt = Date.now()
    const maxAttempts = Math.max(1, (req.retries ?? 1) + 1)

    const messages = [...req.messages]
    let lastError = "resposta vazia"
    let usage: LlmUsage = {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostBrl: 0,
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const raw = await this.chat({ ...req, messages }, true)
      // O custo de uma tentativa descartada continua sendo custo: acumula
      usage = {
        inputTokens: usage.inputTokens + raw.usage.inputTokens,
        outputTokens: usage.outputTokens + raw.usage.outputTokens,
        estimatedCostBrl: usage.estimatedCostBrl + raw.usage.estimatedCostBrl,
      }
      log.debug(`resposta crua (tentativa ${attempt})`, raw.text)

      const parsed = parseJson(raw.text, req.schema)
      if (parsed.ok) {
        return {
          data: parsed.data as T,
          usage,
          provider: this.name,
          model: this.model,
          latencyMs: Date.now() - startedAt,
        }
      }

      lastError = parsed.error ?? "schema não bateu"
      if (attempt < maxAttempts) {
        messages.push(
          { role: "assistant", content: raw.text },
          {
            role: "user",
            content: `A resposta anterior foi rejeitada (${lastError}). Responda APENAS com o JSON válido, sem texto ao redor.`,
          }
        )
      }
    }

    throw new LlmError(
      `Saída inválida após ${maxAttempts} tentativa(s): ${lastError}`,
      "invalid_output"
    )
  }
}

let cached: LlmProvider | null = null

/** `false` desliga a IA em todo o app (ver degradação nas specs). */
export function llmEnabled(): boolean {
  return process.env.LLM_ENABLED !== "false"
}

export async function getLlm(): Promise<LlmProvider> {
  if (cached) return cached
  const name = (process.env.LLM_PROVIDER ?? "ollama").toLowerCase()
  switch (name) {
    case "ollama": {
      const { OllamaProvider } = await import("./providers/ollama")
      cached = new OllamaProvider()
      break
    }
    case "anthropic": {
      const { AnthropicProvider } = await import("./providers/anthropic")
      cached = new AnthropicProvider()
      break
    }
    case "mock": {
      const { MockLlmProvider } = await import("./providers/mock")
      cached = new MockLlmProvider()
      break
    }
    default:
      throw new LlmError(
        `LLM_PROVIDER inválido: "${name}" (use "ollama", "anthropic" ou "mock")`,
        "config"
      )
  }
  return cached
}

/** Usado só em testes para injetar um provedor fake. */
export function __setLlm(p: LlmProvider | null) {
  cached = p
}

/** Timeout por chamada, em ms. */
export function llmTimeoutMs(): number {
  return Number(process.env.LLM_TIMEOUT_MS) || 60_000
}
