import { afterEach, describe, expect, test } from "bun:test"
import { llmDebugEnabled, log } from "./log"

const realLog = console.log
const realError = console.error

function captureConsole() {
  const lines: string[] = []
  const record = (...args: unknown[]) =>
    lines.push(args.map((a) => JSON.stringify(a) ?? String(a)).join(" "))
  console.log = record
  console.error = record
  return lines
}

afterEach(() => {
  console.log = realLog
  console.error = realError
  delete process.env.LLM_DEBUG
})

describe("log — redação de segredos", () => {
  // Critério de aceite da spec 00: a chave nunca aparece em log.
  test("mascara chaves sensíveis por nome do campo", () => {
    const lines = captureConsole()

    log.info("chamando provedor", {
      provider: "anthropic",
      apiKey: "sk-ant-secreta",
      api_key: "sk-ant-secreta",
      token: "bearer-secreto",
      secret: "shhh",
      password: "123456",
      senha: "123456",
      authorization: "Bearer xyz",
      credential: "algo",
    })

    const output = lines.join(" ")
    expect(output).not.toContain("sk-ant-secreta")
    expect(output).not.toContain("bearer-secreto")
    expect(output).not.toContain("shhh")
    expect(output).not.toContain("123456")
    expect(output).not.toContain("Bearer xyz")
    expect(output).toContain("REDACTED")
    // O que não é sensível continua legível
    expect(output).toContain("anthropic")
  })

  test("o nome do campo é comparado sem diferenciar maiúsculas", () => {
    const lines = captureConsole()
    log.info("x", { ApiKey: "sk-ant-secreta", MY_TOKEN: "abc" })

    const output = lines.join(" ")
    expect(output).not.toContain("sk-ant-secreta")
    expect(output).not.toContain("abc")
  })

  test("log.error também mascara", () => {
    const lines = captureConsole()
    log.error("falhou", { apiKey: "sk-ant-secreta", status: 401 })

    const output = lines.join(" ")
    expect(output).not.toContain("sk-ant-secreta")
    expect(output).toContain("401")
  })

  test("sem metadados, não quebra", () => {
    const lines = captureConsole()
    log.info("mensagem simples")
    expect(lines.join(" ")).toContain("mensagem simples")
  })

  test("os logs levam o prefixo do módulo", () => {
    const lines = captureConsole()
    log.info("oi")
    expect(lines.join(" ")).toContain("[llm]")
  })
})

describe("log.debug", () => {
  test("não sai nada sem LLM_DEBUG", () => {
    delete process.env.LLM_DEBUG
    const lines = captureConsole()
    log.debug("resposta crua", { conteudo: "descricao do extrato" })
    expect(lines).toHaveLength(0)
  })

  test("sai no stdout com LLM_DEBUG=true", () => {
    process.env.LLM_DEBUG = "true"
    const lines = captureConsole()
    log.debug("resposta crua", "conteudo sensivel")
    expect(lines.join(" ")).toContain("conteudo sensivel")
  })

  test("qualquer valor diferente de 'true' mantém o debug desligado", () => {
    process.env.LLM_DEBUG = "1"
    const lines = captureConsole()
    log.debug("x", "y")
    expect(lines).toHaveLength(0)
  })

  test("llmDebugEnabled reflete a variável", () => {
    delete process.env.LLM_DEBUG
    expect(llmDebugEnabled()).toBe(false)
    process.env.LLM_DEBUG = "true"
    expect(llmDebugEnabled()).toBe(true)
  })
})
