// Logger do módulo. Só aceita metadados escalares e mascara qualquer chave
// sensível — tokens, segredos e credenciais nunca chegam ao console.

const SENSITIVE = /(token|secret|apikey|api_key|password|senha|authorization|credential)/i

type Meta = Record<string, string | number | boolean | null | undefined>

function sanitize(meta?: Meta): Meta {
  if (!meta) return {}
  const out: Meta = {}
  for (const [key, value] of Object.entries(meta)) {
    out[key] = SENSITIVE.test(key) ? "[REDACTED]" : value
  }
  return out
}

export const log = {
  info(message: string, meta?: Meta) {
    console.log(`[open-finance] ${message}`, sanitize(meta))
  },
  error(message: string, meta?: Meta) {
    console.error(`[open-finance] ${message}`, sanitize(meta))
  },
}
