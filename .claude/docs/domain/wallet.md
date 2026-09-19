---
title: Domínio — Carteira (Wallet)
area: domain
updated: 2026-09-19
---

## Visão geral

Carteira é o **escopo global do app** (desde 2026-09-19): um seletor na sidebar define a carteira ativa e todas as telas passam a ler e gravar dentro dela. Continua sendo um agrupamento livre e **opcional** para transações (ex: "Carteira Pessoal", "Carteira Empresa", "Carteira Investimentos"). Serve para o usuário organizar transações por um critério próprio, sem relação com bancos ou saldo.

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

- **Seletor global** no topo da navegação (sidebar no desktop, drawer no mobile). Define o escopo de Transações, do formulário de transação, da importação CSV e do painel Início. Detalhes em `.claude/docs/frontend/active-wallet.md`.
- **CRUD próprio** em `/wallets`, reaproveitando o componente genérico `ColorEntityCrud` — mesmo padrão visual de Categorias. Acessado pelo item "Gerenciar carteiras" do seletor (não está mais no menu lateral).

Saíram da UI em 2026-09-19: o `Select` de filtro de carteira na tela de Transações e o campo "Carteira (opcional)" no formulário de transação — ambos substituídos pelo seletor global.

## Notas

- Sem seed padrão — cada usuário cria as carteiras que fizer sentido para o seu uso.
- Ver `.claude/docs/api/lookups.md` para o contrato CRUD e `.claude/docs/api/transactions.md` para o campo/filtro em transações.
