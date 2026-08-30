# Dev runner na raiz

`finance/package.json` (raiz) existe só para orquestrar os dois workspaces com **concurrently**.
Não hoista dependências — `app/` e `api/` continuam 100% isolados, com seus próprios `node_modules`.

## Scripts

| Comando | O que faz |
|---------|-----------|
| `bun install` | Instala `concurrently` (única dep da raiz) |
| `bun run dev` | Sobe `api` + `app` em paralelo, prefixos coloridos `api`/`app` |
| `bun run dev:api` | Só a API (`cd api && bun run dev`) |
| `bun run dev:app` | Só o app (`cd app && bun run dev`) |

## Pré-requisitos

- PostgreSQL no ar (`docker compose up -d`) — a API não sobe sem `DATABASE_URL` válido.
- `api/.env` configurado.

## Portas

- app (Vite): `http://localhost:5173`
- api (Elysia): `http://localhost:3001`

## Notas

- Os scripts usam `cd <dir> && bun run dev` em vez de `bun --cwd` porque a flag `--cwd`
  não é aceita pelo `bun run` na versão atual (1.3.x).
- `Ctrl+C` encerra os dois processos juntos.
