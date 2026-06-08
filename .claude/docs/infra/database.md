---
title: Banco de dados — Drizzle ORM + PostgreSQL
area: infra
updated: 2026-06-08
---

## Visão geral

Backend usa **Drizzle ORM** com **postgres.js** como driver. Schema declarativo em TypeScript, migrations gerenciadas pelo **drizzle-kit**.

## Configuração

| Arquivo | Finalidade |
|---------|-----------|
| `api/src/db/schema.ts` | Schema Drizzle — tabelas e enums |
| `api/src/db/index.ts` | Singleton `db` (drizzle + postgres.js) |
| `api/drizzle.config.ts` | Config do drizzle-kit (dialect, schema path, output) |
| `api/.env` | `DATABASE_URL` (não commitado — ver `.env.example`) |

## Conexão

```ts
// api/src/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client, { schema })
```

Nunca instanciar `postgres()` ou `drizzle()` fora deste arquivo.

## Schema atual

### Enum `client_status`

Valores: `NOT_STARTED`, `MESSAGE_SENT`, `NEGOTIATING`, `HAS_SYSTEM`, `NO_RESPONSE`, `REJECTED`, `DISLIKED`, `TRIAL`, `CUSTOM_TRIAL`, `INVALID_CONTACT`

### Tabela `clients`

| Coluna | Tipo PG | Nullable | Default |
|--------|---------|----------|---------|
| `id` | uuid PK | não | `gen_random_uuid()` |
| `name` | varchar(255) | não | — |
| `phone_area_code` | varchar(2) | não | — |
| `phone_number` | varchar(8) | não | — |
| `responsible_phone_area_code` | varchar(2) | sim | — |
| `responsible_phone_number` | varchar(8) | sim | — |
| `city` | varchar(255) | não | — |
| `status` | client_status | não | `NOT_STARTED` |
| `deleted_at` | timestamp | sim | — |
| `created_at` | timestamp | não | `now()` |
| `updated_at` | timestamp | não | `now()` (auto-update) |

## Comandos

```bash
# em api/
bun run db:generate   # gera arquivo de migration em api/drizzle/
bun run db:migrate    # aplica migrations pendentes
bun run db:push       # aplica schema direto sem migration (só dev)
bun run db:studio     # abre Drizzle Studio no browser
```

> Em desenvolvimento prefira `db:push`. Em produção use `db:generate` + `db:migrate`.
