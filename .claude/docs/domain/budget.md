---
title: Domínio — Orçamento (Budget)
area: domain
updated: 2026-06-24
---

## Visão geral

O orçamento é um **catálogo de gastos planejados nomeados** (ex: "Aluguel", "Internet"), classificados pela regra **50/30/20**. Substituiu por completo o modelo antigo (limite mensal por categoria com `categoryId`/`month`/`year`).

## Campos (tabela `budgets`)

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | uuid | — | PK |
| `name` | varchar(255) | sim | Nome do orçamento |
| `type` | enum `budget_type` | sim | `essential` (50%) \| `desire` (30%) \| `investment` (20%) |
| `amountType` | enum `budget_amount_type` | sim | `fixed` \| `variable` |
| `amount` | numeric(10,2) | condicional | Valor fixo — obrigatório se `amountType = fixed` |
| `amountMin` | numeric(10,2) | condicional | Mínimo — obrigatório se `amountType = variable` |
| `amountMax` | numeric(10,2) | condicional | Máximo — obrigatório se `amountType = variable` |

`budget_type` é um enum fixo no sistema (sem CRUD próprio).

## Regras de validação

Aplicadas na rota (`api/src/routes/budgets.ts`, `validateAmounts`):
- `amountType = fixed` → `amount` obrigatório; `amountMin`/`amountMax` ficam nulos.
- `amountType = variable` → `amountMin` e `amountMax` obrigatórios; `amount` fica nulo.
- `amountMin` deve ser **menor que** `amountMax`.

A normalização (`normalizeAmounts`) zera os campos que não se aplicam ao tipo escolhido.

## Integração com Transações

A coluna `transactions.budget_id` (FK nullable → budgets) vincula um gasto fixo ao seu orçamento:
- `recurrence = fixed` → `budgetId` **obrigatório** (400 se ausente).
- `recurrence = variable` → `budgetId` forçado a **nulo**.

Validado em `resolveBudgetId` (`api/src/routes/transactions.ts`). No frontend, o campo só aparece quando a transação é fixa e usa um **combobox com busca** (`BudgetCombobox`) que consulta `GET /budgets?name=...`.

## Impacto da migração

- O widget de "Orçamento" do Dashboard/Home (gasto vs orçado por categoria) foi **removido** — o novo modelo não tem escopo mensal por categoria. `dashboard/summary` não retorna mais `budgetProgress`.
- A página de Orçamentos virou um CRUD agrupado por tipo (50/30/20) com busca por nome.
