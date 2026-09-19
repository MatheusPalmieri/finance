import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { extractJsonText, parseJson } from "./json"

const schema = z.object({ items: z.array(z.object({ index: z.number() })) })

describe("extractJsonText", () => {
  test("JSON puro", () => {
    expect(extractJsonText('{"a":1}')).toBe('{"a":1}')
  })

  test("cercado por bloco de código", () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  test("texto antes e depois", () => {
    const raw = 'Claro! Aqui está:\n{"a":1}\nEspero ter ajudado.'
    expect(extractJsonText(raw)).toBe('{"a":1}')
  })

  test("array na raiz", () => {
    expect(extractJsonText("resposta: [1,2,3] fim")).toBe("[1,2,3]")
  })

  test("chave dentro de string não confunde o balanceamento", () => {
    const raw = '{"name":"a { b } c","n":1}'
    expect(extractJsonText(raw)).toBe(raw)
  })

  test("aspas escapadas dentro de string", () => {
    const raw = '{"name":"diz \\"oi\\" }","n":1}'
    expect(extractJsonText(raw)).toBe(raw)
  })

  test("JSON truncado falha limpo", () => {
    expect(extractJsonText('{"items":[{"index":0}')).toBeNull()
  })

  test("sem JSON nenhum", () => {
    expect(extractJsonText("desculpe, não consigo")).toBeNull()
  })
})

describe("parseJson", () => {
  test("valida no zod", () => {
    const result = parseJson('{"items":[{"index":0}]}', schema)
    expect(result.ok).toBe(true)
    expect(result.data?.items[0].index).toBe(0)
  })

  test("faz parse mas não passa no zod", () => {
    const result = parseJson('{"items":[{"index":"zero"}]}', schema)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("Schema não bateu")
  })

  test("truncado devolve erro, não lança", () => {
    const result = parseJson('{"items":[', schema)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("Nenhum JSON completo")
  })
})
