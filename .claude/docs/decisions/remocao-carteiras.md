---
title: ADR — Remoção das carteiras e contas sandbox
area: decisions
updated: 2026-09-23
---

## Visão geral

**Status:** Aceito, implementado. Falta rodar a migração no banco de dev
(`api/scripts/migrate-remove-wallets.sql`).

A entidade Carteira (`wallets` + `transactions.wallet_id`) foi removida. O app
passa a ter **um escopo só: todas as transações reais**. O isolamento de dados de
teste, que era o único uso prático da carteira, passou para a conta
(`accounts.is_sandbox`).

## Contexto

Com o Open Finance (Pluggy) virando a fonte primária, cada transação chega presa
a uma **conta** do provedor. A carteira era um rótulo manual por cima disso,
preenchido a partir da "carteira ativa" da sidebar, e numa sincronização
automática não existe carteira ativa.

O uso real, medido no banco em 2026-09-23:

| Carteira | Transações | Papel real |
|---|---|---|
| `teste` | 327 | todo o histórico real (Nubank) |
| `Claude` | 7 | dados de teste |
| `Carteira Pessoal` | 0 | nenhum |

Ou seja: a carteira separava real de teste e escopava as telas, nunca agrupou
dinheiro de verdade. O usuário não vai conectar conta PJ, então não há
necessidade de separar Pessoal/Empresa.

## Decisão

- Remover `wallets`, `transactions.wallet_id`, `recurring_series.wallet_id` e
  `monthly_reports.wallet_id`, junto com rota, página, seletor e `WalletProvider`.
- Relatórios mensais passam a ser únicos por `(month, year)`; séries recorrentes
  por `merchant_key`.
- Nova coluna `accounts.is_sandbox`. As transações de contas sandbox **aparecem
  na listagem** (dá para filtrar pela conta), mas ficam **fora de toda análise**.
  Isso vale para dashboard, check-up, projeção, kNN da classificação e detecção
  de recorrências, e o saldo de abertura da projeção também ignora essas contas.
  O filtro único é `REAL_TRANSACTIONS` em `api/src/lib/scope.ts`.
- Transações ganharam filtro por **conta**, que substitui o antigo escopo por
  carteira.

## Migração dos dados

`api/scripts/migrate-remove-wallets.sql`, numa transação única:

1. cria `accounts.is_sandbox` e a conta sandbox `Claude`;
2. move as transações da carteira `Claude` para essa conta;
3. mantém os relatórios e as séries da carteira `teste` como os globais e apaga
   os dos outros escopos, que colidiriam no índice único novo;
4. dropa as colunas e a tabela e cria os índices novos.

## Consequências

- `bun run import:csv <conta> <arquivo.csv> [...]`: a carteira saiu dos argumentos.
- `bun run report:monthly` gera um relatório só.
- A semente do Monte Carlo continua a mesma do antigo escopo global
  (`${ano}-${mês}-global`).
- A regra de dados de teste do `CLAUDE.md` passou para a **conta sandbox `Claude`**.
