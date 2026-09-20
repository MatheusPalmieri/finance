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

### Comandos úteis

```bash
bun run dev            # api + app (raiz)
cd api && bun test     # testes do backend
cd api && bunx tsc --noEmit --moduleResolution bundler   # typecheck
cd app && bun run typecheck && bun run lint
```
