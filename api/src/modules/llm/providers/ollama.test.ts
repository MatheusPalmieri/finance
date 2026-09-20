import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { z } from "zod"
import { OllamaProvider } from "./ollama"
import { LlmError } from "../types"

const realFetch = globalThis.fetch
const schema = z.object({ ok: z.boolean() })

interface Capture {
  url: string
  init: RequestInit
  body: Record<string, unknown>
}

let captured: Capture[] = []

/** Substitui o `fetch` global por uma fila de respostas programada. */
function stubFetch(...responses: (Response | Error)[]) {
  const queue = [...responses]
  captured = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    captured.push({
      url,
      init: init ?? {},
      body: init?.body ? JSON.parse(String(init.body)) : {},
    })
    const next = queue.shift()
    if (next === undefined) throw new Error("stub de fetch sem resposta na fila")
    if (next instanceof Error) throw next
    return next
  }) as typeof fetch
}

function chatResponse(content: string, usage?: { prompt: number; eval: number }) {
  return Response.json({
    message: { content },
    prompt_eval_count: usage?.prompt ?? 42,
    eval_count: usage?.eval ?? 7,
  })
}

beforeEach(() => {
  captured = []
  delete process.env.LLM_MODEL
  delete process.env.OLLAMA_BASE_URL
})

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.LLM_MODEL
  delete process.env.OLLAMA_BASE_URL
})

describe("OllamaProvider — configuração", () => {
  test("usa o modelo e a URL padrão", () => {
    const provider = new OllamaProvider()
    expect(provider.name).toBe("ollama")
    expect(provider.model).toBe("qwen2.5:7b-instruct")
  })

  test("LLM_MODEL sobrescreve o modelo padrão", () => {
    process.env.LLM_MODEL = "llama3.1:8b"
    expect(new OllamaProvider().model).toBe("llama3.1:8b")
  })

  test("OLLAMA_BASE_URL sem barra final é respeitada", async () => {
    process.env.OLLAMA_BASE_URL = "http://10.0.0.5:11434/"
    stubFetch(chatResponse("oi"))

    await new OllamaProvider().complete({
      messages: [{ role: "user", content: "oi" }],
    })

    expect(captured[0].url).toBe("http://10.0.0.5:11434/api/chat")
  })
})

describe("OllamaProvider — corpo da requisição", () => {
  test("sempre envia keep_alive de 30m", async () => {
    stubFetch(chatResponse("oi"))

    await new OllamaProvider().complete({
      messages: [{ role: "user", content: "oi" }],
    })

    // Sem isso, o modelo é descarregado da memória e recarregar custa segundos
    expect(captured[0].body.keep_alive).toBe("30m")
    expect(captured[0].body.stream).toBe(false)
  })

  test("o modo JSON só liga o format no completeJson", async () => {
    stubFetch(chatResponse("texto livre"))
    await new OllamaProvider().complete({
      messages: [{ role: "user", content: "oi" }],
    })
    expect(captured[0].body.format).toBeUndefined()

    stubFetch(chatResponse(JSON.stringify({ ok: true })))
    await new OllamaProvider().completeJson({
      messages: [{ role: "user", content: "oi" }],
      schema,
    })
    expect(captured[0].body.format).toBe("json")
  })

  test("o system prompt vira a primeira mensagem", async () => {
    stubFetch(chatResponse("oi"))

    await new OllamaProvider().complete({
      system: "voce e um classificador",
      messages: [{ role: "user", content: "oi" }],
    })

    const messages = captured[0].body.messages as {
      role: string
      content: string
    }[]
    expect(messages[0]).toEqual({
      role: "system",
      content: "voce e um classificador",
    })
    expect(messages[1].role).toBe("user")
  })

  test("temperatura e maxTokens viram options", async () => {
    stubFetch(chatResponse("oi"))

    await new OllamaProvider().complete({
      messages: [{ role: "user", content: "oi" }],
      temperature: 0.4,
      maxTokens: 1200,
    })

    expect(captured[0].body.options).toEqual({
      temperature: 0.4,
      num_predict: 1200,
    })
  })

  test("sem temperatura informada, usa 0 (determinístico)", async () => {
    stubFetch(chatResponse("oi"))
    await new OllamaProvider().complete({
      messages: [{ role: "user", content: "oi" }],
    })
    expect((captured[0].body.options as { temperature: number }).temperature).toBe(0)
  })
})

describe("OllamaProvider — resposta", () => {
  test("devolve o texto e a contagem de tokens, com custo zero", async () => {
    stubFetch(chatResponse("resposta do modelo", { prompt: 100, eval: 25 }))

    const result = await new OllamaProvider().complete({
      messages: [{ role: "user", content: "oi" }],
    })

    expect(result.data).toBe("resposta do modelo")
    expect(result.usage.inputTokens).toBe(100)
    expect(result.usage.outputTokens).toBe(25)
    // Modelo local não custa nada
    expect(result.usage.estimatedCostBrl).toBe(0)
    expect(result.provider).toBe("ollama")
  })

  test("valida a saída JSON no zod", async () => {
    stubFetch(chatResponse(JSON.stringify({ ok: true })))

    const result = await new OllamaProvider().completeJson({
      messages: [{ role: "user", content: "oi" }],
      schema,
    })
    expect(result.data.ok).toBe(true)
  })

  test("resposta sem conteúdo não quebra", async () => {
    stubFetch(Response.json({}))

    const result = await new OllamaProvider().complete({
      messages: [{ role: "user", content: "oi" }],
    })
    expect(result.data).toBe("")
    expect(result.usage.inputTokens).toBe(0)
  })
})

describe("OllamaProvider — erros", () => {
  test("erro de rede vira LlmError de indisponibilidade", async () => {
    stubFetch(new Error("ECONNREFUSED"))

    const provider = new OllamaProvider()
    let error: unknown
    try {
      await provider.complete({ messages: [{ role: "user", content: "oi" }] })
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(LlmError)
    expect((error as LlmError).kind).toBe("unavailable")
    expect((error as LlmError).message).toContain("Ollama indisponível")
  })

  test("HTTP não-2xx vira LlmError com o status", async () => {
    stubFetch(new Response("modelo nao encontrado", { status: 404 }))

    let error: unknown
    try {
      await new OllamaProvider().complete({
        messages: [{ role: "user", content: "oi" }],
      })
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(LlmError)
    expect((error as Error).message).toContain("404")
  })

  test("erro no corpo da resposta também vira LlmError", async () => {
    stubFetch(Response.json({ error: "model requires more system memory" }))

    let error: unknown
    try {
      await new OllamaProvider().complete({
        messages: [{ role: "user", content: "oi" }],
      })
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(LlmError)
    expect((error as Error).message).toContain("system memory")
  })
})

describe("OllamaProvider — health", () => {
  test("ok quando o modelo configurado está instalado", async () => {
    stubFetch(Response.json({ models: [{ name: "qwen2.5:7b-instruct" }] }))
    expect(await new OllamaProvider().health()).toEqual({ ok: true })
  })

  test("não-ok quando o modelo não está instalado", async () => {
    stubFetch(Response.json({ models: [{ name: "outro:7b" }] }))
    const health = await new OllamaProvider().health()
    expect(health.ok).toBe(false)
    expect(health.detail).toContain("não instalado")
  })

  test("não-ok quando o serviço está fora, sem lançar", async () => {
    stubFetch(new Error("ECONNREFUSED"))
    const health = await new OllamaProvider().health()
    expect(health.ok).toBe(false)
    expect(health.detail).toContain("ECONNREFUSED")
  })

  test("não-ok quando o endpoint responde erro", async () => {
    stubFetch(new Response("", { status: 500 }))
    const health = await new OllamaProvider().health()
    expect(health.ok).toBe(false)
    expect(health.detail).toContain("500")
  })
})
