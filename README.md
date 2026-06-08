# crm

CRM monorepo para Odonto Reativa.

## Estrutura

- `app/` — React 19 + TypeScript + Vite (frontend)
- `api/` — Elysia + Bun + Drizzle ORM (backend)

## Setup

```bash
docker compose up -d
cp api/.env.example api/.env
cd api && bun run db:push
cd api && bun run dev
# outro terminal:
cd app && bun run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
