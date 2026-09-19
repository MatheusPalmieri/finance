// Logger do módulo. Só aceita metadados escalares e mascara qualquer chave
// sensível — chaves de API nunca chegam ao console.

const SENSITIVE =
  /(token|secret|apikey|api_key|password|senha|authorization|credential)/i

type Meta = Record<string, string | number | boolean | null | undefined>

function sanitize(meta?: Meta): Meta {
  if (!meta) return {}
  const out: Meta = {}
  for (const [key, value] of Object.entries(meta)) {
    out[key] = SENSITIVE.test(key) ? "[REDACTED]" : value
  }
  return out
}

/** LLM_DEBUG=true loga prompt/resposta no stdout — nunca no banco. */
export const llmDebugEnabled = () => process.env.LLM_DEBUG === "true"

export const log = {
  info(message: string, meta?: Meta) {
    console.log(`[llm] ${message}`, sanitize(meta))
  },
  error(message: string, meta?: Meta) {
    console.error(`[llm] ${message}`, sanitize(meta))
  },
  /** Só sai com LLM_DEBUG=true. Pode conter descrição de transação. */
  debug(message: string, payload?: unknown) {
    if (!llmDebugEnabled()) return
    console.log(`[llm:debug] ${message}`, payload ?? "")
  },
}
