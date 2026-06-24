---
title: API — Categorias, Formas de pagamento e Bancos
area: api
updated: 2026-06-23
---

## Visão geral

Três módulos de cadastro auxiliar ("lookups"), todos com a mesma estrutura mínima — `id`, `name`, `color`, `createdAt` — e o mesmo contrato CRUD. A validação de corpo usa `t` do Elysia (TypeBox).

| Módulo | Plugin | Prefixo | Tabela |
|--------|--------|---------|--------|
| Categorias | `api/src/routes/categories.ts` | `/categories` | `categories` |
| Formas de pagamento | `api/src/routes/payment-methods.ts` | `/payment-methods` | `payment_methods` |
| Bancos | `api/src/routes/banks.ts` | `/banks` | `banks` |

Os três plugins são montados em `api/src/index.ts`.

## Contrato CRUD (idêntico nos três)

Substitua `{prefix}` por `categories`, `payment-methods` ou `banks`.

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/{prefix}` | Lista todos, ordenado por `name` |
| POST | `/{prefix}` | Cria — body `{ name, color? }` |
| PUT | `/{prefix}/:id` | Edita — body `{ name, color? }`; 404 se não existir |
| DELETE | `/{prefix}/:id` | Remove (hard delete); 404 se não existir |

**Body (POST / PUT):**

```json
{ "name": "Pix", "color": "#06b6d4" }
```

- `name` — obrigatório, `minLength: 1`.
- `color` — opcional; default `#6366f1` na criação. Hex de 7 chars (`#rrggbb`).

**Resposta (POST / PUT / item de GET):**

```json
{
  "id": "uuid",
  "name": "Pix",
  "color": "#06b6d4",
  "createdAt": "2026-06-23T23:35:13.460Z"
}
```

`DELETE` retorna `{ "success": true }`.

## Notas

- **Hard delete**: diferente de `clients`, estes módulos não usam soft delete — o registro é removido de fato.
- **Categorias**: a tabela foi simplificada — os antigos campos `type` (INCOME/EXPENSE) e `icon` e o enum `category_type` foram removidos. `transactions.category_id` e `budgets.category_id` continuam referenciando `categories`; a seleção de categoria em transações/orçamentos agora lista todas as categorias, sem filtro por tipo.
