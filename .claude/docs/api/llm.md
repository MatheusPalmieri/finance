---
title: Camada de LLM (LlmProvider) e endpoints /llm
area: api
updated: 2026-09-19
---

## Visão geral

Interface única com modelos de linguagem, usada pela classificação
(`.claude/docs/domain/classification.md`) e pela narrativa do check-up
(`.claude/docs/domain/monthly-report.md`). Nenhum outro módulo chama um provedor
direto.

Implementa `.claude/docs/specs/00-llm-provider.md`.
Código: `api/src/modules/llm/`.

## Princípio inegociável

**O LLM nunca calcula, nunca soma, nunca inventa valor.** Todo número exibido
ao usuário sai de SQL ou de TypeScript determinístico. O modelo só:

1. **classifica** texto numa opção de uma lista fechada;
2. **narra** um JSON de métricas já calculadas.

Qualquer alucinação numérica é bug de implementação, não limite do modelo.

## Estrutura

```
api/src/modules/llm/
├── index.ts          # exports públicos
├── provider.ts       # interface LlmProvider + BaseLlmProvider + getLlm()
├── service.ts        # runJson/runText com telemetria, aiAvailable(), usage()
├── types.ts          # LlmMessage, LlmTextRequest, LlmJsonRequest, LlmError
├── json.ts           # extractJson tolerante + validação zod
├── log.ts            # logger que mascara chaves sensíveis
├── routes.ts         # GET /llm/health e /llm/usage
└── providers/
    ├── ollama.ts     # default — HTTP local, sem SDK
    ├── anthropic.ts  # fallback de nuvem — fetch puro na Messages API
    └── mock.ts       # fila de respostas programáveis, para testes
```

Os dois adapters de rede usam `fetch` nativo do Bun — mesmo critério que levou
o módulo `open-finance` a não usar o SDK da Pluggy. A única dependência nova do
workspace é o `zod`, que valida toda saída estruturada.

## Interface

```ts
interface LlmProvider {
  readonly name: string
  readonly model: string
  complete(req: LlmTextRequest): Promise<LlmResult<string>>
  completeJson<T>(req: LlmJsonRequest<T>): Promise<LlmResult<T>>
  health(): Promise<{ ok: boolean; detail?: string }>
}
```

`BaseLlmProvider` implementa `completeJson` sobre um `chat()` bruto, com o laço
de reenvio que pede correção quando o parse ou o zod falha (`retries`). O custo
de uma tentativa descartada continua sendo contabilizado. Esgotadas as
tentativas, lança `LlmError` com `kind: "invalid_output"` — nunca devolve `any`
não validado.

### Timeout por chamada

`LlmTextRequest.timeoutMs` sobrescreve `LLM_TIMEOUT_MS` e é aplicado **por
tentativa**, não pelo total. Serve para o caso em que o custo das chamadas é
muito desigual: a narrativa mensal (prompt de ~1 000 tokens, uma vez por mês)
precisa de bem mais tempo que uma classificação de lote. `signal` continua
existindo para cancelamento externo e tem precedência.

`getLlm()` faz cache do provedor; `__setLlm(p)` injeta um fake nos testes e
`__setLlm(null)` limpa.

### `extractJson`

Modelos pequenos cercam o JSON com ```` ```json ````, escrevem uma frase antes
ou devolvem o objeto no meio do texto. `extractJsonText` remove as cercas e
extrai o valor balanceado a partir do **primeiro** delimitador de abertura,
respeitando strings e escapes.

JSON truncado devolve `null` em vez de degradar para um objeto interno completo
— isso seria um recorte silencioso da resposta.

## Adapters

### `ollama` (default)

`POST {OLLAMA_BASE_URL}/api/chat` com `stream: false` e `format: "json"` no modo
estruturado. Modelo default `qwen2.5:7b-instruct`. `estimatedCostBrl` sempre
zero.

Envia **sempre `keep_alive: "30m"`** no corpo: o default do Ollama descarrega o
modelo após 5 min ociosos e recarregar ~5 GB custa segundos justamente durante
uma importação de CSV. Mandar no corpo evita depender de `OLLAMA_KEEP_ALIVE`,
que exigiria reiniciar o serviço.

`health()` checa `/api/tags` em 2s e confirma que o modelo configurado está
instalado.

#### Desempenho medido (2026-09-19, máquina do usuário)

Intel Core Ultra 5 225H, 31 GB RAM, Ollama 0.34.2, `qwen2.5:7b-instruct`:
**10,7 tok/s, 100% CPU** (a iGPU Arc não é engajada). Implicações: narrativa
mensal (~300 tokens) ≈ 30s, uma vez por mês; 10 linhas residuais ≈ 12s; lote
cheio de 40 linhas ≈ 50s — por isso `LLM_BATCH_SIZE` é 40 e as camadas 1 e 2
existem.

### `anthropic` (fallback de nuvem)

`POST https://api.anthropic.com/v1/messages`, headers `x-api-key` +
`anthropic-version: 2023-06-01`. Modelo default `claude-haiku-4-5` (IDs de
modelo da Anthropic **não levam sufixo de data**). A saída JSON vem por
instrução no system e é validada pelo mesmo zod.

`estimatedCostBrl` sai de uma tabela de preço local (USD/MTok, conferida em
2026-09-19) convertida por um câmbio aproximado — serve para mostrar que o custo
mensal fica em centavos, não é contábil.

> Ao mexer neste adapter, carregue a skill `claude-api` antes: ela tem os IDs de
> modelo e os preços atuais. Não escreva preço de memória.

### `mock`

Fila programável (`push(...)`), inspeção das requisições recebidas (`calls`) e
`healthy` alternável. Nenhum teste das specs depende de rede ou GPU.

## Variáveis de ambiente

| Variável | Default | Descrição |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | `ollama` \| `anthropic` \| `mock` |
| `LLM_MODEL` | por provedor | Sobrescreve o modelo default |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Endpoint do Ollama |
| `ANTHROPIC_API_KEY` | — | Obrigatória só com `LLM_PROVIDER=anthropic` |
| `LLM_TIMEOUT_MS` | `60000` | Timeout por chamada |
| `LLM_NARRATIVE_TIMEOUT_MS` | `180000` | Timeout só da narrativa mensal |
| `LLM_ENABLED` | `true` | `false` desliga a IA em todo o app |
| `LLM_DEBUG` | `false` | `true` loga prompt/resposta **no stdout apenas** |

`ANTHROPIC_API_KEY` nunca aparece em log, em resposta de API ou em payload
salvo no banco — o `log.ts` mascara qualquer chave sensível.

## Degradação

Nenhuma funcionalidade quebra com a IA fora. Toda rota que usa LLM responde
`aiAvailable: boolean`.

| Feature | Sem IA |
|---|---|
| Classificação | Só regras e histórico; o resto fica sem categoria, como antes |
| Check-up | Relatório completo com números e insights; só o texto falta, com aviso |

## Observabilidade

Toda chamada grava uma linha em `llm_calls`, **inclusive as que falham** —
feature, provedor, modelo, tokens, custo estimado, latência e erro. Uma falha
ao gravar telemetria nunca derruba a feature que está medindo.

**Não grava prompt nem resposta**: o prompt carrega descrições de transação e a
tabela viraria uma cópia sombra do extrato. Para depurar, `LLM_DEBUG=true`.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/llm/health` | `{ available, provider, model, detail? }` — nunca lança |
| GET | `/llm/usage?from&to` | Total por feature e custo acumulado |

```jsonc
// GET /llm/usage
{
  "byFeature": [
    { "feature": "categorization", "calls": 12, "failures": 0,
      "inputTokens": 4300, "outputTokens": 900,
      "estimatedCostBrl": "0.0000", "avgLatencyMs": 12400 }
  ],
  "totalCostBrl": "0.0000",
  "totalCalls": 12
}
```

## Verificação manual

Os adapters de rede não têm teste automático de integração:

```bash
bun run api/scripts/llm-smoke.ts
LLM_PROVIDER=anthropic bun run api/scripts/llm-smoke.ts
```

O script reporta health, latência, tokens, custo e avisa quando o modelo omite
linhas da resposta — comportamento observado na prática com o modelo local, e a
razão de a spec 01 tolerar índices faltantes.
