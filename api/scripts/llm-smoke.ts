// Teste manual do provedor de LLM configurado. Os adapters de rede não têm
// teste automático — este script é a verificação de fumaça.
//
//   bun run api/scripts/llm-smoke.ts
//   LLM_PROVIDER=anthropic bun run api/scripts/llm-smoke.ts

import { z } from "zod"
import { getLlm } from "../src/modules/llm"

const llm = await getLlm()
console.log(`Provedor: ${llm.name} · modelo: ${llm.model}`)

const health = await llm.health()
console.log(`Health: ${health.ok ? "ok" : `falhou — ${health.detail}`}`)
if (!health.ok) process.exit(1)

const schema = z.object({
  items: z.array(z.object({ index: z.number(), categoria: z.string() })),
})

const startedAt = Date.now()
const result = await llm.completeJson({
  system:
    'Classifique cada descrição em uma categoria. Responda APENAS JSON no formato {"items":[{"index":0,"categoria":"..."}]}',
  messages: [
    {
      role: "user",
      content: "0. netflix\n1. posto shell\n2. conceito imobiliaria",
    },
  ],
  schema,
  temperature: 0,
  retries: 1,
})

console.log(`Latência: ${Date.now() - startedAt}ms`)
console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
console.log(`Custo estimado: R$ ${result.usage.estimatedCostBrl.toFixed(4)}`)
console.log(result.data.items)

// O modelo local costuma omitir linhas — a tolerância a índices faltantes das
// specs não é defensiva demais, é o primeiro comportamento observado.
if (result.data.items.length < 3) {
  console.warn(
    `⚠ O modelo devolveu ${result.data.items.length} de 3 linhas — omissão de índice é esperada e tratada.`
  )
}

process.exit(0)
