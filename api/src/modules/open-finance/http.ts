// Cliente HTTP mínimo para provedores REST: timeout por request e retry com
// backoff exponencial + jitter apenas para erros transitórios (429 / 5xx / rede).

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown
  ) {
    super(message)
    this.name = "HttpError"
  }
}

export interface HttpOptions extends RequestInit {
  /** Timeout total do request em ms (padrão 20s). */
  timeoutMs?: number
  /** Tentativas extras após a primeira falha transitória (padrão 2). */
  retries?: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function backoffDelay(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 8000)
  return base + Math.floor(Math.random() * 250)
}

function isTransient(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500
  // AbortError (timeout) e falhas de rede do fetch caem aqui
  return true
}

export async function httpJson<T>(
  url: string,
  opts: HttpOptions = {}
): Promise<T> {
  const { timeoutMs = 20_000, retries = 2, signal, ...init } = opts
  let lastErr: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs)
      const reqSignal = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal

      const res = await fetch(url, { ...init, signal: reqSignal })
      const text = await res.text()
      let json: unknown = {}
      if (text) {
        try {
          json = JSON.parse(text)
        } catch {
          json = { raw: text }
        }
      }

      if (!res.ok) {
        const message =
          (json as { message?: string })?.message ??
          `HTTP ${res.status} em ${new URL(url).pathname}`
        throw new HttpError(res.status, message, json)
      }
      return json as T
    } catch (err) {
      lastErr = err
      if (attempt === retries || !isTransient(err)) break
      await sleep(backoffDelay(attempt))
    }
  }
  throw lastErr
}
