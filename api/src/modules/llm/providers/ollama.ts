import {
  BaseLlmProvider,
  llmTimeoutMs,
  type RawCompletion,
} from "../provider"
import { LlmError, type LlmTextRequest } from "../types"

const DEFAULT_MODEL = "qwen2.5:7b-instruct"

interface OllamaChatResponse {
  message?: { content?: string }
  prompt_eval_count?: number
  eval_count?: number
  error?: string
}

/**
 * Adapter local. Sem SDK — `fetch` nativo do Bun, mesmo critério do módulo
 * open-finance. Custo sempre zero.
 */
export class OllamaProvider extends BaseLlmProvider {
  readonly name = "ollama"
  readonly model = process.env.LLM_MODEL || DEFAULT_MODEL

  private get baseUrl() {
    return (
      process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") ??
      "http://localhost:11434"
    )
  }

  protected async chat(
    req: LlmTextRequest,
    jsonMode: boolean
  ): Promise<RawCompletion> {
    const messages = req.system
      ? [{ role: "system", content: req.system }, ...req.messages]
      : req.messages

    const body = {
      model: this.model,
      messages,
      stream: false,
      // O default do Ollama descarrega o modelo após 5min ociosos e recarregar
      // ~5GB custa segundos justamente durante uma importação. Mandar no corpo
      // evita depender de OLLAMA_KEEP_ALIVE (exigiria reiniciar o serviço).
      keep_alive: "30m",
      ...(jsonMode ? { format: "json" } : {}),
      options: {
        temperature: req.temperature ?? 0,
        ...(req.maxTokens ? { num_predict: req.maxTokens } : {}),
      },
    }

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: req.signal ?? AbortSignal.timeout(req.timeoutMs ?? llmTimeoutMs()),
      })
    } catch (err) {
      throw new LlmError(
        `Ollama indisponível em ${this.baseUrl}: ${err instanceof Error ? err.message : "erro de rede"}`,
        "unavailable"
      )
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new LlmError(
        `Ollama respondeu ${res.status}: ${detail.slice(0, 200)}`,
        "unavailable"
      )
    }

    const json = (await res.json()) as OllamaChatResponse
    if (json.error) throw new LlmError(`Ollama: ${json.error}`, "unavailable")

    return {
      text: json.message?.content ?? "",
      usage: {
        inputTokens: json.prompt_eval_count ?? 0,
        outputTokens: json.eval_count ?? 0,
        estimatedCostBrl: 0, // modelo local
      },
    }
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      })
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
      const json = (await res.json()) as { models?: { name?: string }[] }
      const installed = json.models?.some((m) => m.name === this.model)
      return installed
        ? { ok: true }
        : { ok: false, detail: `modelo "${this.model}" não instalado` }
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : "sem resposta",
      }
    }
  }
}
