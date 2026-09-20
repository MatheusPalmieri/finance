// E2E da spec 00 — telemetria da camada de LLM e endpoints /llm.

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { z } from "zod"
import { db } from "../db"
import { llmCalls } from "../db/schema"
import { runJson, runText, usage } from "../modules/llm/service"
import { LlmError } from "../modules/llm/types"
import {
  __setLlm,
  api,
  expectRejection,
  makeCategory,
  resetDatabase,
  useMockLlm,
  withAiDisabled,
} from "../test/helpers"

const schema = z.object({ ok: z.boolean() })

beforeEach(resetDatabase)
afterEach(() => __setLlm(null))

describe("e2e GET /llm/health", () => {
  test("reporta o provedor ativo quando está de pé", async () => {
    useMockLlm()
    const res = await api.get<{
      available: boolean
      provider: string | null
      model: string | null
    }>("/llm/health")

    expect(res.status).toBe(200)
    expect(res.body.available).toBe(true)
    expect(res.body.provider).toBe("mock")
  })

  test("provedor indisponível responde não-ok, sem lançar", async () => {
    const mock = useMockLlm()
    mock.healthy = false

    const res = await api.get<{ available: boolean; detail?: string }>(
      "/llm/health"
    )
    expect(res.status).toBe(200)
    expect(res.body.available).toBe(false)
    expect(res.body.detail).toBeTruthy()
  })

  test("com LLM_ENABLED=false explica o motivo", async () => {
    const res = await withAiDisabled(() =>
      api.get<{ available: boolean; detail?: string }>("/llm/health")
    )
    expect(res.body.available).toBe(false)
    expect(res.body.detail).toContain("LLM_ENABLED")
  })
})

describe("e2e telemetria — llm_calls", () => {
  test("uma chamada bem-sucedida grava tokens, custo e latência", async () => {
    useMockLlm(JSON.stringify({ ok: true }))

    await runJson("categorization", {
      messages: [{ role: "user", content: "oi" }],
      schema,
    })

    const rows = await db.select().from(llmCalls)
    expect(rows).toHaveLength(1)
    expect(rows[0].feature).toBe("categorization")
    expect(rows[0].provider).toBe("mock")
    expect(rows[0].success).toBe(true)
    expect(rows[0].inputTokens).toBe(10)
    expect(rows[0].outputTokens).toBe(10)
    expect(rows[0].latencyMs).toBeGreaterThanOrEqual(0)
    expect(rows[0].errorMessage).toBeNull()
  })

  test("uma chamada que falha também é gravada", async () => {
    useMockLlm(new Error("provedor caiu"), new Error("de novo"))

    await expectRejection(
      runJson("monthly_report", {
        messages: [{ role: "user", content: "oi" }],
        schema,
      })
    )

    const rows = await db.select().from(llmCalls)
    expect(rows).toHaveLength(1)
    expect(rows[0].success).toBe(false)
    expect(rows[0].errorMessage).toContain("provedor caiu")
  })

  test("saída que não passa no schema é gravada como falha", async () => {
    useMockLlm("não é json", "ainda não é json")

    const error = await expectRejection(
      runJson("scenario_parse", {
        messages: [{ role: "user", content: "oi" }],
        schema,
        retries: 1,
      })
    )
    expect(error).toBeInstanceOf(LlmError)

    const [row] = await db.select().from(llmCalls)
    expect(row.success).toBe(false)
    expect(row.errorMessage).toContain("Saída inválida")
  })

  test("runText também é instrumentado", async () => {
    useMockLlm("um texto qualquer")

    const result = await runText("monthly_report", {
      messages: [{ role: "user", content: "narre" }],
    })
    expect(result.data).toBe("um texto qualquer")

    const [row] = await db.select().from(llmCalls)
    expect(row.feature).toBe("monthly_report")
    expect(row.success).toBe(true)
  })

  test("com LLM_ENABLED=false nem tenta chamar o provedor", async () => {
    const mock = useMockLlm(JSON.stringify({ ok: true }))

    await withAiDisabled(async () => {
      const error = await expectRejection(
        runJson("categorization", {
          messages: [{ role: "user", content: "oi" }],
          schema,
        })
      )
      expect(error).toBeInstanceOf(LlmError)
    })

    expect(mock.calls).toHaveLength(0)
    // Desligada não é falha do provedor: nada a registrar
    expect(await db.select().from(llmCalls)).toHaveLength(0)
  })

  test("o prompt e a resposta NUNCA vão para o banco", async () => {
    useMockLlm(JSON.stringify({ ok: true }))
    const segredo = "descricao sensivel do extrato do usuario"

    await runJson("categorization", {
      system: segredo,
      messages: [{ role: "user", content: segredo }],
      schema,
    })

    const [row] = await db.select().from(llmCalls)
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain(segredo)
  })
})

describe("e2e GET /llm/usage", () => {
  test("agrega por feature com custo e latência", async () => {
    useMockLlm(
      JSON.stringify({ ok: true }),
      JSON.stringify({ ok: true }),
      new Error("caiu"),
      new Error("caiu de novo")
    )

    await runJson("categorization", {
      messages: [{ role: "user", content: "a" }],
      schema,
    })
    await runJson("categorization", {
      messages: [{ role: "user", content: "b" }],
      schema,
    })
    await expectRejection(
      runJson("monthly_report", {
        messages: [{ role: "user", content: "c" }],
        schema,
      })
    )

    const res = await api.get<{
      byFeature: {
        feature: string
        calls: number
        failures: number
        inputTokens: number
      }[]
      totalCalls: number
      totalCostBrl: string
    }>("/llm/usage")

    expect(res.status).toBe(200)
    expect(res.body.totalCalls).toBe(3)

    const byFeature = new Map(res.body.byFeature.map((f) => [f.feature, f]))
    expect(byFeature.get("categorization")!.calls).toBe(2)
    expect(byFeature.get("categorization")!.failures).toBe(0)
    expect(byFeature.get("categorization")!.inputTokens).toBe(20)
    expect(byFeature.get("monthly_report")!.failures).toBe(1)

    // Provedor local: custo zero
    expect(Number(res.body.totalCostBrl)).toBe(0)
  })

  test("sem chamadas, responde zerado em vez de erro", async () => {
    const res = await api.get<{ byFeature: unknown[]; totalCalls: number }>(
      "/llm/usage"
    )
    expect(res.body.byFeature).toEqual([])
    expect(res.body.totalCalls).toBe(0)
  })

  test("o filtro por período é aplicado", async () => {
    useMockLlm(JSON.stringify({ ok: true }))
    await runJson("categorization", {
      messages: [{ role: "user", content: "a" }],
      schema,
    })

    const future = await usage({ from: "2099-01-01" })
    expect(future.totalCalls).toBe(0)

    const past = await usage({ from: "2000-01-01" })
    expect(past.totalCalls).toBe(1)
  })
})

describe("e2e — a telemetria nunca derruba a feature", () => {
  test("a classificação responde mesmo com a IA falhando", async () => {
    await makeCategory("Lazer")
    useMockLlm(new Error("caiu"), new Error("caiu de novo"))

    const res = await api.post<{ aiAvailable: boolean }>(
      "/classification/suggest",
      { useAi: true, items: [{ index: 0, description: "LOJA NOVA" }] }
    )

    expect(res.status).toBe(200)
    expect(res.body.aiAvailable).toBe(false)
    // E a falha ficou registrada
    const rows = await db.select().from(llmCalls)
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows.every((r) => !r.success)).toBe(true)
  })
})
