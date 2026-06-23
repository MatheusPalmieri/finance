---
title: Infraestrutura — Docker
area: infra
updated: 2026-06-08
---

## Visão geral

O `docker-compose.yml` na raiz do projeto sobe um PostgreSQL local para desenvolvimento. Não há container para a API ou o frontend — esses rodam diretamente com Bun.

## Serviços

| Serviço | Imagem | Porta host | Porta container |
|---------|--------|-----------|----------------|
| `postgres` | `postgres:16-alpine` | **5433** | 5432 |

A porta do host é **5433** (não 5432) para evitar conflito com instâncias locais de PostgreSQL.

## Credenciais

| Variável | Valor |
|----------|-------|
| `POSTGRES_USER` | `finance` |
| `POSTGRES_PASSWORD` | `finance` |
| `POSTGRES_DB` | `finance` |

## DATABASE_URL

```
postgresql://finance:finance@localhost:5433/finance
```

Este valor já está em `api/.env.example`. Copie para `api/.env` antes de rodar o backend.

## Comandos

```bash
# na raiz do projeto
docker compose up -d       # sobe em background
docker compose down        # para e remove containers
docker compose down -v     # para e apaga o volume (reseta o banco)
docker compose logs -f     # acompanha logs
```

## Dados persistidos

O volume `postgres_data` persiste os dados entre restarts. Para resetar o banco completamente use `docker compose down -v`.

## Fluxo de setup inicial

```bash
docker compose up -d          # sobe o postgres
cp api/.env.example api/.env  # configura DATABASE_URL
cd api && bun run db:push     # aplica o schema
cd api && bun run dev         # sobe a API
cd app && bun run dev         # sobe o frontend
```
