import {
  BaseLlmProvider,
  llmTimeoutMs,
  type RawCompletion,
} from "../provider"
import { LlmError, type LlmTextRequest } from "../types"

// Modelo default do fallback de nuvem. IDs de modelo da Anthropic não levam
// sufixo de data — "claude-haiku-4-5" já é o identificador completo.
const DEFAULT_MODEL = "claude-haiku-4-5"

// Preço por milhão de tokens, em USD. Conferido em 2026-09-19 na skill
// `claude-api`. Ao mexer neste arquivo, carregue a skill de novo e reconfira —
// não escreva preço de memória.
const PRICE_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
}

// Câmbio aproximado só para exibir custo estimado em BRL no painel de uso.
// Não é contábil: serve para mostrar que o custo mensal fica em centavos.
const USD_TO_BRL = 5.4

interface AnthropicResponse {
  content?: { type: string; text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
  error?: { message?: string }
}

/**
 * Fallback de nuvem. `fetch` puro na Messages API — mesmo critério que levou o
 * módulo open-finance a não usar o SDK da Pluggy: uma rota, sem dependência nova.
 *
 * A saída JSON vem por instrução no system + validação zod do `BaseLlmProvider`,
 * que já reenvia pedindo correção quando não bate.
 */
export class AnthropicProvider extends BaseLlmProvider {
  readonly name = "anthropic"
  readonly model = process.env.LLM_MODEL || DEFAULT_MODEL

  private apiKey(): string {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) {
      throw new LlmError(
        "ANTHROPIC_API_KEY não configurada (obrigatória com LLM_PROVIDER=anthropic)",
        "config"
      )
    }
    return key
  }

  private estimateCostBrl(inputTokens: number, outputTokens: number): number {
    const price = PRICE_USD_PER_MTOK[this.model]
    if (!price) return 0
    const usd =
      (inputTokens / 1_000_000) * price.input +
      (outputTokens / 1_000_000) * price.output
    return Number((usd * USD_TO_BRL).toFixed(4))
  }

  protected async chat(
    req: LlmTextRequest,
    jsonMode: boolean
  ): Promise<RawCompletion> {
    const system = jsonMode
      ? `${req.system ?? ""}\n\nResponda APENAS com JSON válido, sem texto ao redor e sem cercas de código.`.trim()
      : req.system

    // Fora do try: chave ausente é erro de CONFIGURAÇÃO, e o catch abaixo
    // marcaria como "provedor fora do ar" — mandando procurar o problema errado.
    const apiKey = this.apiKey()

    let res: Response
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // A chave nunca é logada — ver log.ts
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature ?? 0,
          ...(system ? { system } : {}),
          messages: req.messages.map((m) => ({
            // A Messages API não aceita role "system" dentro de messages
            role: m.role === "system" ? "user" : m.role,
            content: m.content,
          })),
        }),
        signal: req.signal ?? AbortSignal.timeout(llmTimeoutMs()),
      })
    } catch (err) {
      throw new LlmError(
        `Anthropic indisponível: ${err instanceof Error ? err.message : "erro de rede"}`,
        "unavailable"
      )
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new LlmError(
        `Anthropic respondeu ${res.status}: ${detail.slice(0, 200)}`,
        res.status === 401 || res.status === 403 ? "config" : "unavailable"
      )
    }

    const json = (await res.json()) as AnthropicResponse
    if (json.error) {
      throw new LlmError(`Anthropic: ${json.error.message}`, "unavailable")
    }

    const inputTokens = json.usage?.input_tokens ?? 0
    const outputTokens = json.usage?.output_tokens ?? 0

    return {
      text:
        json.content
          ?.filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("") ?? "",
      usage: {
        inputTokens,
        outputTokens,
        estimatedCostBrl: this.estimateCostBrl(inputTokens, outputTokens),
      },
    }
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { ok: false, detail: "ANTHROPIC_API_KEY não configurada" }
    }
    try {
      // 1 token de saída: o mais barato que confirma chave e modelo válidos
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(2000),
      })
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` }
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : "sem resposta",
      }
    }
  }
}
