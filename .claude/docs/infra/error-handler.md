---
title: Handler global de erros da API (`onError`)
area: infra
updated: 2026-08-30
---

## Contexto

O Drizzle embrulha qualquer falha de query numa `DrizzleQueryError` cuja
`message` é só `"Failed query: <sql>\nparams: ..."`. A causa real (ex.:
`PostgresError: column "payment_method" does not exist`) fica em `error.cause`.

Sem tratamento, o Elysia devolvia 500 com esse texto genérico e **nada** ia
para o terminal da API — impossível diagnosticar drift de schema pelo front.

## Decisão

`api/src/index.ts` registra um `.onError()` global que:

1. desembrulha `error.cause` (fallback para `error`);
2. loga a causa real no console da API (`[CODE] <erro>`);
3. responde `404` para `NOT_FOUND`, senão `500`, com `{ message }` contendo a
   mensagem da causa.

## Como diagnosticar um 500

Olhe o terminal onde roda `bun run dev` / `bun run dev:api`. A linha
`[INTERNAL_SERVER_ERROR] PostgresError: ...` mostra o motivo. Erro de coluna
ou tipo de enum inexistente = schema fora de sincronia → rodar
`cd api && bun run db:push`.
