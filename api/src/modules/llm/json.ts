// Parse tolerante da saída de um LLM. Modelos pequenos cercam o JSON com
// ```json, escrevem uma frase antes, ou devolvem o objeto no meio do texto.
// Funções puras, sem I/O — cobertas por json.test.ts.

import type { ZodType } from "zod"

/**
 * Extrai o valor JSON (objeto ou array) balanceado a partir do primeiro
 * delimitador de abertura do texto. Ignora chaves/colchetes dentro de strings
 * e respeita escapes.
 *
 * Devolve `null` quando esse valor não fecha — JSON truncado falha limpo em vez
 * de degradar para um objeto interno completo, que seria um recorte silencioso
 * da resposta.
 */
export function extractJsonText(raw: string): string | null {
  // Remove cercas de código antes de procurar — evita casar a crase
  const text = raw.replace(/```(?:json)?/gi, "")

  const start = text.search(/[{[]/)
  if (start === -1) return null

  const open = text[start]
  const close = open === "{" ? "}" : "]"

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const char = text[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      if (inString) escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === open) depth++
    else if (char === close) {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export interface ParseResult<T> {
  ok: boolean
  data?: T
  /** Mensagem curta para reenviar ao modelo pedindo correção. */
  error?: string
}

/** Extrai, faz `JSON.parse` e valida no zod. Nunca lança. */
export function parseJson<T>(raw: string, schema: ZodType<T>): ParseResult<T> {
  const text = extractJsonText(raw)
  if (!text) return { ok: false, error: "Nenhum JSON completo na resposta." }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return {
      ok: false,
      error: `JSON inválido: ${err instanceof Error ? err.message : "erro de parse"}`,
    }
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("; ")
    return { ok: false, error: `Schema não bateu: ${issues}` }
  }
  return { ok: true, data: result.data }
}
