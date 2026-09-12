---
title: Domínio — Carteira (Wallet)
area: domain
updated: 2026-09-11
---

## Visão geral

Carteira é um agrupamento livre e **opcional** para transações (ex: "Carteira Pessoal", "Carteira Empresa", "Carteira Investimentos"). Serve para o usuário organizar transações por um critério próprio, sem relação com bancos ou saldo.

É um conceito **independente** de `accounts` (Conta): Conta representa banco/tipo de conta com saldo (`CHECKING`, `SAVINGS`, `CREDIT_CARD`, etc.) e é obrigatória em toda transação; Carteira não tem saldo, tipo ou conta padrão, e é opcional.

## Modelo de dados

Tabela `wallets` (`api/src/db/schema.ts`):

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `name` | varchar(100) | obrigatório |
| `color` | varchar(7) | default `#6366f1` |
| `createdAt` | timestamp | |

`transactions.walletId` — uuid, FK para `wallets.id`, **nullable**, sem `onDelete` (segue o mesmo padrão de `budgetId`). Excluir uma carteira referenciada por transações falha com erro de FK do Postgres — comportamento igual ao de categoria/conta/orçamento hoje, não há tratamento especial.

## Onde aparece

- **CRUD próprio** em `/wallets` (página "Carteiras" na sidebar), reaproveitando o componente genérico `ColorEntityCrud` — mesmo padrão visual de Categorias.
- **Filtro** na tela de Transações ("Todas as carteiras", ao lado de Categoria/Recorrência).
- **Campo opcional** no formulário de criar/editar transação ("Carteira (opcional)", com opção "Nenhuma").

## Notas

- Sem seed padrão — cada usuário cria as carteiras que fizer sentido para o seu uso.
- Ver `.claude/docs/api/lookups.md` para o contrato CRUD e `.claude/docs/api/transactions.md` para o campo/filtro em transações.
