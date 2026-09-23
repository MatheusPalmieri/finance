# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Regra de commit/push (OBRIGATÓRIA)

**Ao finalizar cada interação/tarefa, sempre faça `git commit` das alterações pendentes e `git push`.**
Nunca deixe trabalho concluído fora do controle de versão.
Antes de encerrar a resposta, rode `git status` e confirme que está limpo e sincronizado com o remoto (inclusive arquivos novos não rastreados) — vale para toda interação, mesmo as curtas ou de conversa.

- Commits seguem Conventional Commits.
- Não commitar extratos bancários (`NU_*.csv`) nem segredos — usar `.gitignore`.
- Se o usuário corrigir uma regra ou forma de trabalho, **atualize o harness**
  (este `CLAUDE.md`, `.claude/settings.json` ou memória) e faça um novo commit
  registrando a correção.

---

## Regra de dados de teste (OBRIGATÓRIA)

**Toda transação criada para teste, depuração ou verificação manual deve ficar
na conta sandbox chamada `Claude`** (`accounts.is_sandbox = true`). Nunca misture
dados de teste com as contas reais do usuário.

- Se a conta `Claude` não existir, crie antes de testar:
  `POST /accounts` com
  `{ "name": "Claude", "type": "CHECKING", "color": "#d97757", "isSandbox": true }`.
- Escolha a conta `Claude` no formulário da transação (ou no `ImportModal`).
  Transações de conta sandbox aparecem na listagem, mas ficam fora de toda
  análise (ver `.claude/docs/domain/transaction.md`, "Conta sandbox").
- A mesma regra vale para importação de CSV de teste e para inserts feitos
  direto no Postgres.
- Não é preciso apagar os dados depois: eles ficam isolados nessa conta.

---

## Skills disponíveis

Este projeto tem skills configuradas em `.claude/skills/`. Use-as sempre que o contexto bater:

| Skill | Quando usar |
|-------|------------|
| `/docs` | **OBRIGATÓRIO** após qualquer mudança — criar ou atualizar doc em `.claude/docs/` |
| `/elysiajs` | Ao criar ou modificar rotas/plugins Elysia no `api/` |
| `/vite` | Ao configurar o Vite ou criar novos módulos no `app/` |
| `/shadcn` | Ao adicionar ou customizar componentes shadcn/ui |
| `/frontend-design` | Ao criar ou redesenhar páginas e componentes visuais |
| `/impeccable` | Ao revisar ou polir qualidade visual de UI |
| `/postgresql-optimization` | Ao escrever queries complexas no Drizzle |
| `/sql-code-review` | Ao revisar queries SQL geradas pelo Drizzle |
| `/sql-optimization` | Ao otimizar queries com índices ou planos de execução |
| `/nodejs-best-practices` | Ao tomar decisões de arquitetura no backend |
| `/caveman` | Para respostas ultra-compactas quando contexto é limitado |

### Regra de documentação (OBRIGATÓRIA)

**Toda mudança de código deve ter documentação correspondente em `.claude/docs/`.** Isso inclui: novas rotas, novos componentes, mudanças de schema, novas configs de infra, decisões técnicas relevantes.

Use `/docs` para criar ou atualizar o doc. Nunca termine uma tarefa sem checar se a doc está em dia.

Docs existentes:
- `.claude/docs/domain/open-finance.md` — sync com a Pluggy: normalização, janela, vínculo de contas, religar/adotar/remover, campos do usuário preservados
- `.claude/docs/domain/forecast.md` — projeção Monte Carlo do saldo, cenários, veredito "posso comprar?" e reserva mínima
- `.claude/docs/api/forecast.md` — endpoints /forecast e /settings
- `.claude/docs/frontend/forecast.md` — página /forecast (gráfico de leque, painel de cenário) e card no Home
- `.claude/docs/domain/classification.md` — motor de classificação em 3 camadas (regras/histórico/IA), regras aprendidas e detector de recorrências
- `.claude/docs/domain/monthly-report.md` — check-up mensal: métricas, anomalias (mediana/MAD), insights e validação anti-alucinação
- `.claude/docs/api/classification.md` — endpoints /classification e /recurring
- `.claude/docs/api/reports.md` — endpoints /reports (check-up mensal)
- `.claude/docs/api/llm.md` — camada `LlmProvider` (Ollama/Anthropic/mock), env vars, degradação e telemetria
- `.claude/docs/frontend/rules.md` — página /rules (regras + cobranças recorrentes)
- `.claude/docs/frontend/reports.md` — página /reports (check-up) e card no Home
- `.claude/docs/infra/scheduler.md` — agendamento mensal no Windows e fallback in-app
- `.claude/docs/infra/testing.md` — suíte da API: banco de teste isolado, helpers de e2e e o que cada suíte cobre
- `.claude/docs/infra/pluggy-probe.md` — `bun run pluggy:probe`: sondagem somente leitura da Pluggy (F0 do Open Finance), env vars e o que ela mede
- `.claude/docs/infra/csv-import-cli.md` — `bun run import:csv`: importa vários extratos de uma vez, com dedupe e classificação
- `.claude/docs/domain/client.md` — entidade Client, regras de negócio, status
- `.claude/docs/domain/transaction.md` — entidade Transação (despesa e entrada via sinal de amount), regras de saldo, conta padrão e conta sandbox
- `.claude/docs/domain/budget.md` — entidade Orçamento (50/30/20), validações e link com transações
- `.claude/docs/api/clients.md` — todos os endpoints /clients
- `.claude/docs/api/lookups.md` — endpoints /categories (bancos, carteiras e formas de pagamento removidos como CRUD)
- `.claude/docs/api/transactions.md` — endpoints /transactions, /accounts (padrão) e /dashboard
- `.claude/docs/api/budgets.md` — endpoints /budgets e integração budget_id nas transações
- `.claude/docs/frontend/lookups.md` — página CRUD de categorias (bancos removido, formas de pagamento não é mais CRUD, ver domain/transaction.md)
- `.claude/docs/frontend/transactions-filters.md` — navegação por mês, período específico e filtro por conta em Transações
- `.claude/docs/frontend/transactions-import.md` — importação de extrato CSV (Nubank) com revisão antes de salvar
- `.claude/docs/decisions/remocao-carteiras.md` — ADR: por que as carteiras saíram e como a conta sandbox isola dados de teste
- `.claude/docs/decisions/remocao-open-finance.md` — ADR: por que a integração Open Finance (Pluggy) foi removida
- `.claude/docs/decisions/elysia-status-helper.md` — ADR: usar status() (não error()) nos handlers
- `.claude/docs/frontend/pages.md` — rotas, componentes, modais
- `.claude/docs/frontend/performance.md` — code-splitting, split de vendor, React Query, re-render
- `.claude/docs/frontend/design-tokens.md` — paleta esmeralda, lib/tokens.ts, tint(), regras de cor
- `.claude/docs/frontend/responsive.md` — sidebar desktop + drawer mobile, breakpoints, touch targets
- `.claude/docs/frontend/states.md` — estados loading/erro/vazio/sucesso e ErrorState
- `.claude/docs/infra/dev-runner.md` — script `bun run dev` na raiz que sobe api + app juntos (concurrently)
- `.claude/docs/infra/error-handler.md` — handler global `onError` que desembrulha `error.cause` (Drizzle) e loga o erro real do Postgres
- `.claude/docs/infra/database.md` — Drizzle ORM, schema, comandos, seed padrão vs seed de desenvolvimento
- `.claude/docs/infra/docker.md` — Docker Compose, PostgreSQL local
- `.claude/docs/infra/cors.md` — CORS, origem permitida
- `.claude/docs/decisions/phone-normalization.md` — ADR do telefone sem 9 inicial
- `.claude/docs/decisions/phase-system.md` — proposta de phase + closeReason + timestamps de transição (PROPOSTO)

### Specs de produto

Cada uma é autocontida e pode ser desenvolvida individualmente. Ver
`.claude/docs/specs/README.md` para a ordem recomendada e as dependências.

- ✅ `.claude/docs/specs/00-llm-provider.md` — camada `LlmProvider` (Ollama/Anthropic/mock) — **implementada**
- ✅ `.claude/docs/specs/01-smart-categorization.md` — categorização em 3 camadas que aprende + detecção de assinaturas — **implementada**
- ✅ `.claude/docs/specs/02-monthly-checkup.md` — relatório mensal com anomalias e narrativa de IA — **implementada**
- ✅ `.claude/docs/specs/03-cashflow-simulator.md` — projeção de fluxo de caixa (Monte Carlo) e simulador "posso comprar?" — **implementada**
- 🚧 `.claude/docs/specs/04-open-finance.md` — Open Finance (Pluggy) como fonte primária; **saldo e investimentos sempre buscados ao vivo, nunca persistidos** — **F0 concluída**

---

## Structure

Monorepo with two independent workspaces — each has its own `node_modules`, `package.json`, and git config:

- `app/` — React 19 + TypeScript + Vite frontend
- `api/` — Elysia + Bun backend

```
app/src/
├── components/
│   ├── layout/       # Sidebar, AppLayout
│   └── ui/           # shadcn components
├── lib/
│   ├── utils.ts      # cn() utility
│   └── api.ts        # fetch helpers (api.clients.*)
├── pages/
│   ├── Clients/      # Full CRUD — table + 4 modals
│   ├── Home.tsx
│   ├── Funnel.tsx
│   ├── Reports.tsx
│   └── Dashboard.tsx
└── types/
    └── client.ts     # Client, ClientStatus, label/color maps

api/src/
├── db/
│   ├── index.ts      # Drizzle singleton (postgres.js)
│   └── schema.ts     # Drizzle schema — clients table + ClientStatus enum
├── lib/
│   └── phone.ts      # normalizePhone(), formatPhone()
├── routes/
│   └── clients.ts    # Elysia plugin — all /clients endpoints
└── index.ts          # Entry point
```

## Commands

All commands run from within the respective workspace directory (`app/` or `api/`).

### raiz (`finance/`)

```bash
bun install        # Instala concurrently (única dep da raiz)
bun run dev        # Sobe api + app juntos (concurrently) — precisa do Postgres no ar
bun run dev:api    # Só a api
bun run dev:app    # Só o app
```

### app/

```bash
bun run dev        # Dev server (Vite) — http://localhost:5173
bun run build      # tsc -b && vite build
bun run lint       # ESLint
bun run format     # Prettier
bun run typecheck  # tsc --noEmit
bun run preview    # Preview production build
```

### api/

```bash
bun run dev            # Watch mode: bun run --watch src/index.ts
bun run test           # Prepara o banco de teste e roda tudo (ver infra/testing.md)
bun run test:db        # Só prepara o banco de teste (idempotente)
bun run typecheck      # tsc --noEmit
bun run db:generate    # Generate migration files (drizzle-kit)
bun run db:migrate     # Run pending migrations
bun run db:push        # Push schema directly (dev only)
bun run db:studio      # Drizzle Studio (GUI)
bun run db:seed:rules  # Regras de classificação (idempotente)
bun run report:monthly # Gera o check-up mensal — aceita YYYY-MM
bun run import:csv <conta> <arquivo.csv> [...]  # Importa extratos em lote (idempotente)
bun run pluggy:probe   # F0 Open Finance: sonda a conta Meu Pluggy (somente leitura)
```

API listens on `http://localhost:3001` (ver `api/src/index.ts`). Requires `api/.env` with `DATABASE_URL`.

### Docker (raiz do projeto)

```bash
docker compose up -d    # Sobe PostgreSQL na porta 5433
docker compose down     # Para containers
docker compose down -v  # Para e apaga volume (reseta banco)
```

## Setup inicial

```bash
docker compose up -d
cp api/.env.example api/.env
cd api && bun run db:push
cd .. && bun install
bun run dev   # sobe api + app juntos
```

## Tech Stack

### Frontend (`app/`)

- **React 19** + **TypeScript 6** (strict mode, `noUnusedLocals`, `noUnusedParameters`)
- **React Router DOM v7** — rotas lazy sob `AppLayout` (sidebar nav)
- **Vite 8** — path alias `@/*` → `./src/*`
- **Tailwind CSS 4** via `@tailwindcss/vite`
- **shadcn/ui** (style: `radix-luma`) — add components with `bunx shadcn add <component>`
- **Radix UI** primitives via `radix-ui` package
- **CVA** (`class-variance-authority`) for component variants
- **Lucide React** for icons

### Backend (`api/`)

- **Bun** runtime
- **Elysia** web framework — entry point `src/index.ts`
- **Drizzle ORM** + **postgres.js** — type-safe SQL, schema in `src/db/schema.ts`
- **drizzle-kit** — migration tooling, config at `api/drizzle.config.ts`

### Infra

- **Docker Compose** — PostgreSQL 16-alpine na porta `5433` (credenciais: `finance/finance/finance`)

## Business Rules

### Phone numbers

Brazilian mobile numbers post-2012 have a leading "9" (e.g., `(11) 9 9999-9999`).
The automation integration requires 8-digit format without that leading 9.

- `phoneAreaCode` / `responsiblePhoneAreaCode` — always 2 digits (DDD)
- `phoneNumber` / `responsiblePhoneNumber` — always 8 digits, no leading 9
- `normalizePhone()` in `api/src/lib/phone.ts` handles the stripping
- Phones are NOT unique — duplicates are allowed but flagged with `hasDuplicate: true`

Full decision rationale → `.claude/docs/decisions/phone-normalization.md`

### Client status

Defined in `ClientStatus` enum (see `api/src/db/schema.ts` and `app/src/types/client.ts`):
`NOT_STARTED | MESSAGE_SENT | NEGOTIATING | HAS_SYSTEM | NO_RESPONSE | REJECTED | DISLIKED | TRIAL | CUSTOM_TRIAL | INVALID_CONTACT`

Use the dedicated `PATCH /clients/:id/status` endpoint (and `StatusModal`) to change status — not the general edit.

### Client modals (Clients page)

Four distinct modals to avoid overloading a single form:
1. **CreateClientModal** — full form (name, phone, city, status)
2. **EditClientModal** — same fields, pre-filled
3. **StatusModal** — status only
4. **ResponsibleModal** — responsible phone only

### Soft delete

`DELETE /clients/:id` sets `deletedAt`, never removes rows. All queries filter `WHERE deleted_at IS NULL`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clients` | List with pagination, search, status filter, duplicate flag |
| POST | `/clients` | Create |
| GET | `/clients/:id` | Get by ID |
| PUT | `/clients/:id` | Update general fields |
| PATCH | `/clients/:id/status` | Update status only |
| PATCH | `/clients/:id/responsible` | Update responsible phone |
| DELETE | `/clients/:id` | Soft delete |

Query params for `GET /clients`: `page`, `limit`, `search`, `status`, `duplicates=true`.

Full contract → `.claude/docs/api/clients.md`

## Code Conventions

**All code in English. Comments in Portuguese (pt-BR). DB column names in English (snake_case).**

**Prettier** (`.prettierrc` in `app/`):
- No semicolons
- Double quotes
- 2-space indent, 80-char width
- Trailing commas: ES5
- `prettier-plugin-tailwindcss` auto-sorts classes
- `cn` and `cva` treated as Tailwind functions

**`cn()` utility** (`@/lib/utils`) — combine `clsx` + `tailwind-merge`. Always use it for conditional class composition.

## Key Patterns

### Theme

`app/src/components/theme-provider.tsx` — context-based light/dark/system theme with localStorage persistence. Exposes `useTheme()` hook. Press `d` to toggle.

### shadcn components

Config in `app/components.json`. Components go to `@/components/ui/`, utilities to `@/lib/`, hooks to `@/hooks/`. Run `bunx shadcn add <name>` to scaffold new ones.

### Button variants

`app/src/components/ui/button.tsx` uses CVA with variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link` and sizes: `xs`, `sm`, `default`, `lg`, `icon`. Supports `asChild` via Radix Slot.

### API client (`app/src/lib/api.ts`)

Thin fetch wrapper. All client endpoints exposed as `api.clients.*`. Throws on non-2xx responses with the backend's `message` field.

### Database access (`api/src/db/index.ts`)

Single `db` export (Drizzle instance). Import schema from `../db/schema` in route files. Never instantiate Drizzle or postgres outside `db/index.ts`.
