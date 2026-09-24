---
title: Banco de dados — Drizzle ORM + PostgreSQL
area: infra
updated: 2026-09-23
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

### Open Finance (spec 04)

| Tabela | Papel |
|---|---|
| `pluggy_items` | Conexão com o banco (`item_id` único), status na Pluggy, `last_synced_at` e `last_full_sync_at` |
| `pluggy_accounts` | Conta do provedor (`provider_account_id` único) e vínculo obrigatório com `accounts` |
| `pluggy_transactions` | Payload cru de cada transação (`provider_transaction_id` único) e o `transaction_id` que ela alimenta |
| `sync_runs` | Histórico de cada sync: gatilho, janela completa ou não, contadores e erro |
| `open_finance_snapshots` | Cache persistente: último retrato de `balances` e `investments` (`payload jsonb`, `fetched_at`). Ver `domain/open-finance.md` |

`transactions.external_id` é **obrigatório** e `transaction_source` só aceita
`open_finance`. `accounts` não tem `balance`, `is_default` nem `is_sandbox`.

Migrações do banco de dev (SQL à mão, porque o `db:push --force` ofereceria
truncar `transactions`):

| Script | O que faz |
|---|---|
| `api/scripts/migrate-open-finance.sql` | F1 da spec 04: tabelas do sync |
| `api/scripts/migrate-open-finance-only.sql` | Open Finance como fonte única: apaga o que não veio de lá, remove as colunas manuais, restringe `transaction_source`, cria `open_finance_snapshots`. Faça `pg_dump` antes (comando no cabeçalho do arquivo) |

## Comandos

```bash
# em api/
bun run db:generate   # gera arquivo de migration em api/drizzle/
bun run db:migrate    # aplica migrations pendentes
bun run db:push       # aplica schema direto sem migration (só dev)
bun run db:studio     # abre Drizzle Studio no browser
bun run db:seed       # categorias (ver "Seed" abaixo)
bun run sync:pluggy   # única entrada de dados: contas, transações e saldo vêm do Open Finance
```

> Em desenvolvimento prefira `db:push`. Em produção use `db:generate` + `db:migrate`.

## Seed

Só **um** seed, e sem dado financeiro:

| Script | Arquivo | O que sobe |
|--------|---------|-----------|
| `bun run db:seed` | `api/src/db/seed.ts` | `categoriesData` (13 categorias fixas). Nenhuma conta, saldo ou transação |

- Contas, saldos e transações vêm **só do Open Finance**: rode `bun run
  sync:pluggy` (ou abra o app) depois do seed. As contas nascem no primeiro sync.
- "Outros" é obrigatória: é a categoria de fallback do sync.
- **Não existe seed de dados fake.** O `db:seed:dev` (transações aleatórias) e o
  `import:csv` foram removidos em 2026-09-23 — ver
  `decisions/open-finance-fonte-unica.md`.
- Categorias padrão: Lazer, Transporte, Estudos, Investimento, Alimentação, Office, Saúde, Compras, Música, Moradia, Assinaturas, Serviços, Outros.
