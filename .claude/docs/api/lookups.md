---
title: API — Categorias
area: api
updated: 2026-07-01
---

## Visão geral

Um único módulo de cadastro auxiliar ("lookup"): Categorias — `id`, `name`, `color`, `createdAt`. A validação de corpo usa `t` do Elysia (TypeBox).

| Módulo | Plugin | Prefixo | Tabela |
|--------|--------|---------|--------|
| Categorias | `api/src/routes/categories.ts` | `/categories` | `categories` |

Montado em `api/src/index.ts`.

> **Bancos foi removido por completo em 2026-07-01** (rota, página, tabela `banks`) — era um cadastro avulso sem nenhuma ligação real com `accounts`/`transactions` (nunca teve FK apontando pra ele). Se precisar de novo, é uma feature nova, não um "restaurar".
>
> **Formas de pagamento não é um lookup CRUD.** É uma lista fixa de 6 valores (enum `payment_method` no banco) — sem tela de cadastro, sem tabela `payment_methods`. Ver `.claude/docs/domain/transaction.md` (seção "Forma de pagamento") para a lista completa.

## Contrato CRUD

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/categories` | Lista todos, ordenado por `name` |
| POST | `/categories` | Cria — body `{ name, color? }` |
| PUT | `/categories/:id` | Edita — body `{ name, color? }`; 404 se não existir |
| DELETE | `/categories/:id` | Remove (hard delete); 404 se não existir |

**Body (POST / PUT):**

```json
{ "name": "Lazer", "color": "#f97316" }
```

- `name` — obrigatório, `minLength: 1`.
- `color` — opcional; default `#6366f1` na criação. Hex de 7 chars (`#rrggbb`).

**Resposta (POST / PUT / item de GET):**

```json
{
  "id": "uuid",
  "name": "Lazer",
  "color": "#f97316",
  "createdAt": "2026-07-01T23:35:13.460Z"
}
```

`DELETE` retorna `{ "success": true }`.

## Notas

- **Hard delete**: diferente de `clients`, este módulo não usa soft delete — o registro é removido de fato.
- A tabela foi simplificada — os antigos campos `type` (INCOME/EXPENSE), `icon` e o enum `category_type` foram removidos. `transactions.category_id` e `budgets.category_id` continuam referenciando `categories`; a seleção de categoria em transações/orçamentos lista todas, sem filtro por tipo.
- As 13 categorias padrão (Lazer, Transporte, Estudos, Investimento, Alimentação, Office, Saúde, Compras, Música, Moradia, Assinaturas, Serviços, Outros) vêm do seed — ver `.claude/docs/infra/database.md`.
