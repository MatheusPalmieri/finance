---
title: Spec — Camada de LLM (LlmProvider)
area: specs
status: PROPOSTO
updated: 2026-09-19
---

## Por que este documento existe

As specs [`01-smart-categorization.md`](./01-smart-categorization.md) e
[`02-monthly-checkup.md`](./02-monthly-checkup.md) usam um modelo de linguagem.
A spec [`03-cashflow-simulator.md`](./03-cashflow-simulator.md) usa opcionalmente.
Para que cada uma possa ser desenvolvida **isoladamente**, a interface com o LLM
é definida uma única vez aqui.

> **Se você for implementar apenas uma das specs**, implemente este documento
> junto — ele é pequeno (um arquivo de tipos, uma interface, dois adapters) e é
> pré-requisito das três. Nenhuma das specs deve chamar um SDK de LLM direto.

---

## Princípio inegociável

**O LLM nunca calcula, nunca soma, nunca inventa valor.**

Todo número exibido ao usuário sai de SQL ou de código TypeScript determinístico.
O LLM só faz três coisas:

1. **Classificar** texto em uma opção de uma lista fechada (spec 01).
2. **Narrar** um JSON de métricas já calculadas (spec 02).
3. **Traduzir** linguagem natural em parâmetros estruturados (spec 03).

Consequência prática: um modelo pequeno (7–8B) local dá conta das três, e
qualquer alucinação numérica é um bug de implementação (um número chegou ao
usuário sem passar pelo motor determinístico), não um limite do modelo.

---

## Estrutura de arquivos

Segue o padrão do módulo `open-finance` (ver `api/src/modules/open-finance/`):

```
api/src/modules/llm/
├── index.ts          # export { getLlm, __setLlm } + tipos públicos
├── provider.ts       # interface LlmProvider + factory getLlm()
├── types.ts          # LlmMessage, LlmJsonRequest, LlmTextRequest, LlmUsage
├── json.ts           # extractJson(): parse tolerante + validação zod
├── providers/
│   ├── ollama.ts     # default — HTTP local, sem SDK
│   ├── anthropic.ts  # fallback de nuvem — fetch puro na Messages API
│   └── mock.ts       # respostas fixas para testes
└── provider.test.ts
```

Nenhuma dependência nova no `api/package.json`. Os dois adapters usam `fetch`
nativo do Bun — o mesmo critério que levou o módulo `open-finance` a não usar o
SDK da Pluggy.

---

## Interface

```ts
// api/src/modules/llm/types.ts

export type LlmRole = "system" | "user" | "assistant"

export interface LlmMessage {
  role: LlmRole
  content: string
}

export interface LlmUsage {
  inputTokens: number
  outputTokens: number
  /** Custo estimado em BRL. Zero nos provedores locais. */
  estimatedCostBrl: number
}

export interface LlmTextRequest {
  system?: string
  messages: LlmMessage[]
  maxTokens?: number
  /** 0 = determinístico. Default 0 para classificação, 0.4 para narrativa. */
  temperature?: number
  signal?: AbortSignal
}

export interface LlmJsonRequest<T> extends LlmTextRequest {
  /** Schema zod que valida a saída. A chamada falha se não bater. */
  schema: import("zod").ZodType<T>
  /** Quantas vezes reenviar pedindo correção quando o parse/validação falha. */
  retries?: number
}

export interface LlmResult<T> {
  data: T
  usage: LlmUsage
  /** Nome do provedor que respondeu — vai para o log e para a UI. */
  provider: string
  model: string
  latencyMs: number
}
```

```ts
// api/src/modules/llm/provider.ts

export interface LlmProvider {
  readonly name: string
  readonly model: string
  /** Texto livre — usado só pela narrativa do check-up mensal. */
  complete(req: LlmTextRequest): Promise<LlmResult<string>>
  /** Saída estruturada validada por zod — usado por classificação e cenários. */
  completeJson<T>(req: LlmJsonRequest<T>): Promise<LlmResult<T>>
  /** Ping rápido (< 2s) — a UI usa para mostrar "IA indisponível". */
  health(): Promise<{ ok: boolean; detail?: string }>
}
```

A factory espelha `getProvider()` do open-finance, inclusive o
`__setLlm()` para injeção em teste:

```ts
let cached: LlmProvider | null = null

export async function getLlm(): Promise<LlmProvider> {
  if (cached) return cached
  const name = (process.env.LLM_PROVIDER ?? "ollama").toLowerCase()
  switch (name) {
    case "ollama": { /* import dinâmico */ break }
    case "anthropic": { /* import dinâmico */ break }
    case "mock": { /* import dinâmico */ break }
    default:
      throw new Error(`LLM_PROVIDER inválido: "${name}"`)
  }
  return cached!
}

/** Usado só em testes para injetar um provedor fake. */
export function __setLlm(p: LlmProvider | null) { cached = p }
```

---

## Adapters

### `ollama.ts` (default)

`POST http://localhost:11434/api/chat` com `stream: false` e
`format: "json"` quando for `completeJson`. Modelo default:
`qwen2.5:7b-instruct` (bom em pt-BR e em seguir schema JSON).
`estimatedCostBrl` é sempre `0`. Timeout default de 60s (`AbortSignal.timeout`).

### `anthropic.ts` (fallback de nuvem)

`POST https://api.anthropic.com/v1/messages`, headers
`x-api-key` + `anthropic-version: 2023-06-01`. Modelo default:
`claude-haiku-4-5-20251001`. Saída JSON via *tool use* com o schema convertido,
ou via prefill `{` — o que for mais simples na implementação; ambos
validados pelo mesmo zod depois. `estimatedCostBrl` calculado a partir de uma
tabela de preço local (constante no arquivo, com a data da última conferência em
comentário).

> Ao mexer no adapter da Anthropic, carregue a skill `claude-api` antes — ela
> tem os IDs de modelo e os preços atuais. Não escreva preço de memória.

### `mock.ts`

Fila de respostas programáveis (`queue.push(...)`), usada nos testes das três
specs para que nenhum teste dependa de rede ou de GPU.

---

## Variáveis de ambiente

Adicionar a `api/.env.example`:

| Variável | Default | Descrição |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | `ollama` \| `anthropic` \| `mock` |
| `LLM_MODEL` | por provedor | Sobrescreve o modelo default |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Endpoint do Ollama |
| `ANTHROPIC_API_KEY` | — | Obrigatória só quando `LLM_PROVIDER=anthropic` |
| `LLM_TIMEOUT_MS` | `60000` | Timeout por chamada |
| `LLM_ENABLED` | `true` | `false` desliga a IA em todo o app (ver degradação) |

`ANTHROPIC_API_KEY` nunca aparece em log, em resposta de API ou em payload
salvo no banco.

---

## Degradação sem IA (obrigatória nas três specs)

Nenhuma funcionalidade pode **quebrar** quando o LLM está fora do ar,
`LLM_ENABLED=false` ou sem chave. O comportamento esperado:

| Spec | Sem IA |
|---|---|
| 01 Categorização | Só as regras determinísticas aplicam; as linhas sem match ficam sem categoria, exatamente como hoje |
| 02 Check-up | O relatório é gerado com todos os números e insights; só o texto narrativo fica ausente, com um aviso discreto na UI |
| 03 Simulador | Funciona 100% — a IA ali só traduz frase em parâmetros, e o formulário manual sempre existe |

Toda rota que usa LLM responde com o campo `aiAvailable: boolean` para a UI
saber o que mostrar.

---

## Observabilidade

Tabela compartilhada pelas três specs:

```ts
export const llmCalls = pgTable("llm_calls", {
  id: uuid("id").defaultRandom().primaryKey(),
  // "categorization" | "monthly_report" | "scenario_parse"
  feature: varchar("feature", { length: 40 }).notNull(),
  provider: varchar("provider", { length: 30 }).notNull(),
  model: varchar("model", { length: 80 }).notNull(),
  inputTokens: integer("input_tokens").default(0).notNull(),
  outputTokens: integer("output_tokens").default(0).notNull(),
  estimatedCostBrl: numeric("estimated_cost_brl", { precision: 10, scale: 4 })
    .default("0")
    .notNull(),
  latencyMs: integer("latency_ms").notNull(),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
```

`GET /llm/usage?from&to` devolve total por feature e custo acumulado — é o que
comprova na prática que o custo mensal fica em centavos.

**Não gravar o prompt nem a resposta** nesta tabela: o prompt carrega descrições
de transação do usuário e a tabela viraria uma cópia sombra do extrato. Para
depuração, `LLM_DEBUG=true` loga no stdout apenas, nunca no banco.

---

## Testes

- `provider.test.ts` — `getLlm()` respeita `LLM_PROVIDER`, erra em valor
  inválido, faz cache e `__setLlm(null)` limpa.
- `json.test.ts` — `extractJson()` lida com: JSON puro, JSON cercado por
  ``` ```json ```, texto antes/depois, JSON truncado (deve falhar limpo), e
  saída que faz parse mas não passa no zod (deve tentar `retries` vezes).
- Os adapters de rede não têm teste de integração automático; ficam cobertos
  por um script manual `bun run api/scripts/llm-smoke.ts`.

---

## Critérios de aceite

- [ ] `getLlm()` funciona com `ollama`, `anthropic` e `mock`.
- [ ] `completeJson` devolve dado validado por zod ou lança erro tipado após as
      tentativas — nunca devolve `any` não validado.
- [ ] Toda chamada grava uma linha em `llm_calls`, inclusive as que falham.
- [ ] Com o Ollama desligado, `health()` responde `{ ok: false }` em menos de 2s
      e nenhuma rota das outras specs retorna 500 por causa disso.
- [ ] `ANTHROPIC_API_KEY` não aparece em nenhum log.
