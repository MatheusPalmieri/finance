import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { z } from "zod"
import { AnthropicProvider } from "./anthropic"
import { LlmError } from "../types"

const realFetch = globalThis.fetch
const schema = z.object({ ok: z.boolean() })

interface Capture {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

let captured: Capture[] = []

function stubFetch(...responses: (Response | Error)[]) {
  const queue = [...responses]
  captured = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({
      url: typeof input === "string" ? input : input.toString(),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : {},
    })
    const next = queue.shift()
    if (next === undefined) throw new Error("stub de fetch sem resposta na fila")
    if (next instanceof Error) throw next
    return next
  }) as typeof fetch
}

function messageResponse(
  text: string,
  usage = { input_tokens: 1000, output_tokens: 500 }
) {
  return Response.json({ content: [{ type: "text", text }], usage })
}

beforeEach(() => {
  captured = []
  process.env.ANTHROPIC_API_KEY = "sk-ant-chave-de-teste"
  delete process.env.LLM_MODEL
})

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.LLM_MODEL
})

describe("AnthropicProvider — configuração", () => {
  test("o modelo default não leva sufixo de data", () => {
    const provider = new AnthropicProvider()
    expect(provider.name).toBe("anthropic")
    expect(provider.model).toBe("claude-haiku-4-5")
    expect(provider.model).not.toMatch(/\d{8}$/)
  })

  test("LLM_MODEL sobrescreve o modelo", () => {
    process.env.LLM_MODEL = "claude-sonnet-5"
    expect(new AnthropicProvider().model).toBe("claude-sonnet-5")
  })

  test("sem ANTHROPIC_API_KEY, lança erro de configuração", async () => {
    delete process.env.ANTHROPIC_API_KEY
    stubFetch(messageResponse("oi"))

    let error: unknown
    try {
      await new AnthropicProvider().complete({
        messages: [{ role: "user", content: "oi" }],
      })
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(LlmError)
    expect((error as LlmError).kind).toBe("config")
    expect((error as Error).message).toContain("ANTHROPIC_API_KEY")
  })
})

describe("AnthropicProvider — requisição", () => {
  test("envia os headers da Messages API", async () => {
    stubFetch(messageResponse("oi"))

    await new AnthropicProvider().complete({
      messages: [{ role: "user", content: "oi" }],
    })

    expect(captured[0].url).toBe("https://api.anthropic.com/v1/messages")
    expect(captured[0].headers["x-api-key"]).toBe("sk-ant-chave-de-teste")
    expect(captured[0].headers["anthropic-version"]).toBe("2023-06-01")
  })

  test("o system vai no campo próprio, fora de messages", async () => {
    stubFetch(messageResponse("oi"))

    await new AnthropicProvider().complete({
      system: "voce e um consultor",
      messages: [{ role: "user", content: "oi" }],
    })

    expect(captured[0].body.system).toBe("voce e um consultor")
    const messages = captured[0].body.messages as { role: string }[]
    expect(messages.every((m) => m.role !== "system")).toBe(true)
  })

  test("no modo JSON, reforça a instrução no system", async () => {
    stubFetch(messageResponse(JSON.stringify({ ok: true })))

    await new AnthropicProvider().completeJson({
      system: "classifique",
      messages: [{ role: "user", content: "oi" }],
      schema,
    })

    expect(String(captured[0].body.system)).toContain("APENAS com JSON")
  })

  test("a Messages API não aceita role system dentro de messages", async () => {
    stubFetch(messageResponse("oi"))

    await new AnthropicProvider().complete({
      messages: [
        { role: "system", content: "instrução" },
        { role: "user", content: "oi" },
      ],
    })

    const messages = captured[0].body.messages as { role: string }[]
    expect(messages[0].role).toBe("user")
  })

  test("maxTokens e temperatura são repassados", async () => {
    stubFetch(messageResponse("oi"))

    await new AnthropicProvider().complete({
      messages: [{ role: "user", content: "oi" }],
      maxTokens: 1200,
      temperature: 0.4,
    })

    expect(captured[0].body.max_tokens).toBe(1200)
    expect(captured[0].body.temperature).toBe(0.4)
  })
})

describe("AnthropicProvider — resposta e custo", () => {
  test("concatena apenas os blocos de texto", async () => {
    stubFetch(
      Response.json({
        content: [
          { type: "thinking", thinking: "ignorar" },
          { type: "text", text: "parte 1 " },
          { type: "text", text: "parte 2" },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
    )

    const result = await new AnthropicProvider().complete({
      messages: [{ role: "user", content: "oi" }],
    })
    expect(result.data).toBe("parte 1 parte 2")
  })

  test("estima o custo em BRL a partir dos tokens", async () => {
    // Haiku 4.5: US$ 1,00/MTok entrada e US$ 5,00/MTok saída
    stubFetch(
      messageResponse("oi", { input_tokens: 1_000_000, output_tokens: 1_000_000 })
    )

    const result = await new AnthropicProvider().complete({
      messages: [{ role: "user", content: "oi" }],
    })

    // (1 + 5) USD convertidos; o câmbio é aproximado, então confere a ordem
    expect(result.usage.estimatedCostBrl).toBeGreaterThan(25)
    expect(result.usage.estimatedCostBrl).toBeLessThan(40)
  })

  test("uso pequeno custa frações de centavo", async () => {
    stubFetch(messageResponse("oi", { input_tokens: 1000, output_tokens: 200 }))

    const result = await new AnthropicProvider().complete({
      messages: [{ role: "user", content: "oi" }],
    })
    expect(result.usage.estimatedCostBrl).toBeLessThan(0.05)
  })

  test("modelo fora da tabela de preço não inventa custo", async () => {
    process.env.LLM_MODEL = "claude-modelo-desconhecido"
    stubFetch(messageResponse("oi"))

    const result = await new AnthropicProvider().complete({
      messages: [{ role: "user", content: "oi" }],
    })
    expect(result.usage.estimatedCostBrl).toBe(0)
  })
})

describe("AnthropicProvider — erros", () => {
  test("401 vira erro de configuração, não de indisponibilidade", async () => {
    stubFetch(new Response("invalid api key", { status: 401 }))

    let error: unknown
    try {
      await new AnthropicProvider().complete({
        messages: [{ role: "user", content: "oi" }],
      })
    } catch (err) {
      error = err
    }

    expect((error as LlmError).kind).toBe("config")
  })

  test("500 vira erro de indisponibilidade", async () => {
    stubFetch(new Response("overloaded", { status: 500 }))

    let error: unknown
    try {
      await new AnthropicProvider().complete({
        messages: [{ role: "user", content: "oi" }],
      })
    } catch (err) {
      error = err
    }

    expect((error as LlmError).kind).toBe("unavailable")
  })

  test("erro de rede vira LlmError", async () => {
    stubFetch(new Error("getaddrinfo ENOTFOUND"))

    let error: unknown
    try {
      await new AnthropicProvider().complete({
        messages: [{ role: "user", content: "oi" }],
      })
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(LlmError)
    expect((error as Error).message).toContain("Anthropic indisponível")
  })

  test("a chave nunca aparece na mensagem de erro", async () => {
    stubFetch(new Response("erro", { status: 500 }))

    let error: unknown
    try {
      await new AnthropicProvider().complete({
        messages: [{ role: "user", content: "oi" }],
      })
    } catch (err) {
      error = err
    }

    expect((error as Error).message).not.toContain("sk-ant-chave-de-teste")
  })
})

describe("AnthropicProvider — health", () => {
  test("sem chave configurada, responde não-ok sem chamar a rede", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const health = await new AnthropicProvider().health()

    expect(health.ok).toBe(false)
    expect(health.detail).toContain("ANTHROPIC_API_KEY")
    expect(captured).toHaveLength(0)
  })

  test("ok quando a API responde", async () => {
    stubFetch(messageResponse("pong"))
    expect((await new AnthropicProvider().health()).ok).toBe(true)
    // O ping é o mais barato possível
    expect(captured[0].body.max_tokens).toBe(1)
  })

  test("não-ok quando a API recusa", async () => {
    stubFetch(new Response("", { status: 401 }))
    const health = await new AnthropicProvider().health()
    expect(health.ok).toBe(false)
    expect(health.detail).toContain("401")
  })

  test("não-ok quando a rede falha, sem lançar", async () => {
    stubFetch(new Error("timeout"))
    const health = await new AnthropicProvider().health()
    expect(health.ok).toBe(false)
  })
})
