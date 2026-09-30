---
title: API — Orçamentos (Budgets)
area: api
updated: 2026-09-30
---

## Visão geral

`api/src/routes/budgets.ts`, prefixo `/budgets`. O orçamento é o plano de uma
categoria (ver `domain/budget.md`). A rota é endereçada pelo **id da
categoria** e grava junto o grupo 50/30/20 dela.

## Endpoints

| Método | Caminho | Descrição |
|---|---|---|
| GET | `/budgets` | Todos os orçamentos, cada um com `category` |
| GET | `/budgets/summary?month&year` | Realizado do mês (default: mês atual) |
| PUT | `/budgets/:categoryId` | Grava o grupo da categoria e cria, altera ou remove o orçamento |
| DELETE | `/budgets/:categoryId` | Remove só o orçamento (404 se não houver) |

### PUT `/budgets/:categoryId`

```json
{ "group": "essential", "amountType": "range", "amountMin": 2700, "amountMax": 3000 }
```

| Campo | Regra |
|---|---|
| `group` | `essential` \| `variable` \| `investment` — gravado em `categories.group` |
| `amountType` | `exact` \| `range` \| `null` (`null` = categoria sem orçamento) |
| `amount` | Obrigatório e > 0 quando `exact` |
| `amountMin` / `amountMax` | Obrigatórios quando `range`; mín ≥ 0 e mín < máx |

- Faz upsert pelo índice único de `category_id`, numa transação com a
  atualização do grupo.
- Resposta: `{ category, budget }`, com `budget: null` quando `amountType` é
  `null`.
- Erros: 400 (valores inválidos), 404 (categoria inexistente).
- Excluir a categoria (`DELETE /categories/:id`) apaga o orçamento dela (cascade).

### GET `/budgets/summary`

```json
{
  "month": 9, "year": 2026,
  "income": 23697.83,
  "spentByGroup": { "essential": 3019.09, "variable": 1200, "investment": 350 },
  "investmentFlow": { "invested": 500, "redeemed": 150 },
  "spentByCategory": { "<categoryId>": { "total": 2291.98, "count": 1 } }
}
```

- `spentByGroup` e `spentByCategory` vêm de `lib/spending.ts` (saídas `regular`
  + líquido de `kind = investment`; sem fatura nem transferência própria).
- `spentByCategory` só lista categorias com movimento no mês. O `count` alimenta
  o status `missing` do check-up.
- `income`: entradas `regular` do mês, que são a base da % na tela.
- `investmentFlow`: aplicações e resgates brutos (`kind = investment`).

## Categorias (`/categories`)

`POST` e `PUT` aceitam `group` opcional (default `variable`). Ver
`api/lookups.md`.
