import { BaseLlmProvider, type RawCompletion } from "../../modules/llm/provider"
import { LlmError, type LlmTextRequest } from "../../modules/llm/types"

/**
 * Dublê de teste: fila de respostas programáveis. Nenhum teste das specs
 * depende de rede ou de GPU. Mora em `src/test/` de propósito: o app em
 * execução não tem como selecionar este provedor — só testes o injetam
 * com `__setLlm()`.
 *
 * ```ts
 * const llm = new MockLlmProvider()
 * llm.push(JSON.stringify({ items: [] }))
 * __setLlm(llm)
 * ```
 */
export class MockLlmProvider extends BaseLlmProvider {
  readonly name = "mock"
  readonly model = process.env.LLM_MODEL || "mock-model"

  /** Respostas a devolver, em ordem. Cada chamada consome uma. */
  readonly queue: (string | Error)[] = []
  /** Requisições recebidas — os testes inspecionam o que foi enviado. */
  readonly calls: { req: LlmTextRequest; jsonMode: boolean }[] = []
  /** Quando false, `health()` responde não-ok. */
  healthy = true

  push(...responses: (string | Error)[]) {
    this.queue.push(...responses)
    return this
  }

  reset() {
    this.queue.length = 0
    this.calls.length = 0
    this.healthy = true
  }

  protected async chat(
    req: LlmTextRequest,
    jsonMode: boolean
  ): Promise<RawCompletion> {
    this.calls.push({ req, jsonMode })
    const next = this.queue.shift()
    if (next === undefined) {
      throw new LlmError("MockLlmProvider: fila vazia", "unavailable")
    }
    if (next instanceof Error) throw next
    return {
      text: next,
      usage: { inputTokens: 10, outputTokens: 10, estimatedCostBrl: 0 },
    }
  }

  async health() {
    return this.healthy
      ? { ok: true }
      : { ok: false, detail: "mock marcado como indisponível" }
  }
}
