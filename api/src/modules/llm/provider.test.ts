import { afterEach, describe, expect, test } from "bun:test"
import { z } from "zod"
import { __setLlm, getLlm, llmEnabled } from "./provider"
import { MockLlmProvider } from "./providers/mock"
import { LlmError } from "./types"

const schema = z.object({ items: z.array(z.object({ index: z.number() })) })

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

afterEach(() => __setLlm(null))

describe("getLlm", () => {
  test("respeita LLM_PROVIDER", async () => {
    __setLlm(null)
    process.env.LLM_PROVIDER = "mock"
    const llm = await getLlm()
    expect(llm.name).toBe("mock")
    delete process.env.LLM_PROVIDER
  })

  test("erra em provedor inválido", async () => {
    __setLlm(null)
    process.env.LLM_PROVIDER = "gpt"
    await expect(getLlm()).rejects.toThrow(/LLM_PROVIDER inválido/)
    delete process.env.LLM_PROVIDER
  })

  test("faz cache e __setLlm(null) limpa", async () => {
    __setLlm(null)
    process.env.LLM_PROVIDER = "mock"
    const first = await getLlm()
    expect(await getLlm()).toBe(first)
    __setLlm(null)
    expect(await getLlm()).not.toBe(first)
    delete process.env.LLM_PROVIDER
  })
})

describe("llmEnabled", () => {
  test("default é ligado", () => {
    withEnv({ LLM_ENABLED: undefined }, () => expect(llmEnabled()).toBe(true))
  })

  test("LLM_ENABLED=false desliga", () => {
    withEnv({ LLM_ENABLED: "false" }, () => expect(llmEnabled()).toBe(false))
  })
})

describe("completeJson", () => {
  test("devolve dado validado", async () => {
    const llm = new MockLlmProvider().push('{"items":[{"index":0}]}')
    const result = await llm.completeJson({
      messages: [{ role: "user", content: "oi" }],
      schema,
    })
    expect(result.data.items[0].index).toBe(0)
    expect(llm.calls[0].jsonMode).toBe(true)
  })

  test("reenvia pedindo correção e aceita a segunda", async () => {
    const llm = new MockLlmProvider().push(
      "desculpe, não consigo",
      '{"items":[{"index":2}]}'
    )
    const result = await llm.completeJson({
      messages: [{ role: "user", content: "oi" }],
      schema,
      retries: 1,
    })
    expect(result.data.items[0].index).toBe(2)
    expect(llm.calls).toHaveLength(2)
    // O custo da tentativa descartada continua contando
    expect(result.usage.inputTokens).toBe(20)
  })

  test("lança LlmError tipado após esgotar as tentativas", async () => {
    const llm = new MockLlmProvider().push("nada", "nada de novo")
    const promise = llm.completeJson({
      messages: [{ role: "user", content: "oi" }],
      schema,
      retries: 1,
    })
    await expect(promise).rejects.toBeInstanceOf(LlmError)
  })
})

describe("health", () => {
  test("mock indisponível responde não-ok", async () => {
    const llm = new MockLlmProvider()
    llm.healthy = false
    expect((await llm.health()).ok).toBe(false)
  })
})
