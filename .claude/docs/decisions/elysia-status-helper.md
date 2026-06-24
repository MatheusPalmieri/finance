---
title: ADR — Usar `status()` (não `error()`) nos handlers Elysia
area: decisions
updated: 2026-06-24
---

## Contexto

Os handlers das rotas destruíam `error` do contexto (`async ({ params, error }) => error(404, ...)`). Nesta versão do Elysia esse helper **não existe no contexto** — `error` é `undefined`, e qualquer caminho de erro estourava em runtime com `error is not a function`. O TypeScript já sinalizava: `Property 'error' does not exist on type ...` (com sugestão de `status`).

Como os smoke tests anteriores exercitaram só caminhos felizes, o bug passou despercebido até a validação 400 dos orçamentos.

## Decisão

Usar o helper correto do contexto: **`status(code, body)`**.

```ts
.get("/:id", async ({ params, status }) => {
  const [row] = await db.select()...
  if (!row) return status(404, { message: "Não encontrado" })
  return row
})
```

## Escopo aplicado

Todas as rotas foram migradas de `error` → `status`: `accounts`, `banks`, `budgets`, `categories`, `payment-methods`, `transactions`. Com isso o `tsc` do backend ficou **100% limpo** (antes só restavam os erros de `error`).

## Observação

A rota legada `clients.ts` (não montada em `index.ts`) não foi alterada.
