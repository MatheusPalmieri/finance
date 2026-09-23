# finance

Monorepo de finanças pessoais.

## Estrutura

- `app/` — React 19 + TypeScript + Vite (frontend)
- `api/` — Elysia + Bun + Drizzle ORM (backend)

## Setup

```bash
docker compose up -d              # PostgreSQL na porta 5435
cp api/.env.example api/.env      # ajuste as variáveis (ver abaixo)
cd api && bun install && bun run db:push
cd .. && bun install
bun run dev                       # sobe api + app juntos
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

### Open Finance (Pluggy)

Fonte primária das transações. Preencha no `api/.env` as credenciais do
[Meu Pluggy](https://meu.pluggy.ai) (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`)
e o ID da conexão (`PLUGGY_ITEM_IDS`, o UUID em
`meu.pluggy.ai/connections/<id>`).

```bash
cd api
bun run pluggy:probe          # sondagem somente leitura da conta
bun run sync:pluggy --dry-run # o que o sync faria, sem gravar
bun run sync:pluggy           # sincroniza (o app também sincroniza sozinho ao abrir)
```

Saldo e investimentos **não são guardados**: são sempre buscados ao vivo.
Detalhes em `.claude/docs/specs/04-open-finance.md`.

### Comandos úteis

```bash
bun run dev            # api + app (raiz)
cd api && bun run test # testes do backend (banco de teste isolado)
cd api && bunx tsc --noEmit --moduleResolution bundler   # typecheck
cd app && bun run typecheck && bun run lint
```
