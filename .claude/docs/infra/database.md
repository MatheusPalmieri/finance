---
title: Banco de dados — Drizzle ORM + PostgreSQL
area: infra
updated: 2026-07-01
---

> ⚠️ **A confirmar:** a seção "Schema atual" abaixo (enum `client_status`, tabela `clients`) descreve um CRM diferente que não existe neste projeto Finance — parece copiado de outro projeto do monorepo. O schema real do Finance é `api/src/db/schema.ts` (`accounts`, `categories`, `transactions`, `budgets` + enums `account_type`, `recurrence`, `budget_type`, `budget_amount_type`, `payment_method`). A seção **Seed** abaixo é factual e específica deste projeto.

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
bun run db:seed       # seed padrão — contas + categorias (ver "Seed" abaixo)
bun run db:seed:dev   # seed de desenvolvimento — padrão + orçamentos + ~90 dias de transações fake
```

> Em desenvolvimento prefira `db:push`. Em produção use `db:generate` + `db:migrate`.

## Seed

Dois scripts, propósitos diferentes — **não são pra rodar em sequência**, são alternativos:

| Script | Arquivo | O que sobe |
|--------|---------|-----------|
| `bun run db:seed` | `api/src/db/seed.ts` | **Seed padrão**: só `accountsData` (Nubank/Itaú/Mercado Pago, saldo `0.00`) + `categoriesData` (13 categorias fixas). Sem transação nenhuma. |
| `bun run db:seed:dev` | `api/src/db/seed-dev.ts` | **Seed de desenvolvimento**: chama `seedBase()` (mesmo de cima), ajusta saldos fake nas contas, cria os orçamentos do catálogo 50/30/20 e gera ~90 dias de transações aleatórias (fixas + variáveis) pra ter volume de dados pra testar a UI. |

- `seed.ts` exporta `seedBase()` — é a função reaproveitada por `seed-dev.ts`, então as contas/categorias nunca ficam dessincronizadas entre os dois scripts (fonte única).
- `seed.ts` roda sozinho quando executado diretamente (`if (import.meta.main)`), sem afetar o import feito por `seed-dev.ts`.
- **Rode `db:seed` sempre que subir um banco novo** (container do zero) num ambiente de uso real — é o baseline de configuração (contas e categorias do dia a dia). Edite `accountsData`/`categoriesData` em `seed.ts` conforme sua necessidade real mudar.
- **Rode `db:seed:dev` só em ambiente de desenvolvimento/teste** — nunca num banco que você quer manter "limpo" (ele gera dezenas de transações fake).
- Accounts padrão: `Nubank` (`isDefault: true`), `Itaú`, `Mercado Pago` — todas `CHECKING`, saldo `0.00` no seed padrão.
- Categorias padrão: Lazer, Transporte, Estudos, Investimento, Alimentação, Office, Saúde, Compras, Música, Moradia, Assinaturas, Serviços, Outros.
