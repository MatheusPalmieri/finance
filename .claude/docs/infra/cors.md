---
title: CORS — Configuração da API
area: infra
updated: 2026-06-08
---

## Visão geral

A API usa o plugin `@elysiajs/cors` para permitir requisições do frontend em desenvolvimento.

## Configuração

```ts
// api/src/index.ts
.use(cors({ origin: "http://localhost:5173" }))
```

A origem permitida é `http://localhost:5173` (Vite dev server padrão). Para produção, alterar para a URL real do frontend.

## Pacote

```bash
# já instalado em api/
@elysiajs/cors@1.4.2
```
