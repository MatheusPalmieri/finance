---
title: ADR — Open Finance como fonte única de verdade
area: decisions
updated: 2026-09-23
---

## Visão geral

**Status:** Aceito e implementado. Migração aplicada no banco de dev em
2026-09-23 (backup em `backups/finance-antes-of-only-2026-09-23.dump`). Depois
dela, `db:push` não aponta diferença, e o primeiro sync gravou os dois retratos.

A partir de 2026-09-23 o Open Finance (Pluggy) é a **única** fonte de dados
financeiros do app. Não existe lançamento manual, importação de extrato, saldo
digitado nem dado mockado. Tudo o que vem da Pluggy é **gravado no banco** e
servido de lá. A Pluggy só é chamada quando o dado vence.

## Contexto

A spec 04 fez do Open Finance a fonte primária, mas manteve três caminhos
paralelos: "Nova transação", importação CSV (UI e `import:csv`) e
`accounts.balance` digitado. Isso trazia:

- **Duas verdades** — linhas manuais/CSV conviviam com as do banco. Foi preciso
  adoção e dedupe, e ainda sobraram duplicatas (proventos agrupados no CSV).
- **Saldo que mentia** — criar/editar/excluir transação mexia em
  `accounts.balance`, que não tinha relação com o saldo real.
- **Tela vazia com a Pluggy fora** — saldo e investimentos "nunca persistidos"
  deixavam Início, Contas e Projeção sem número a cada falha de rede.
- **Dado de teste no banco real** — a conta sandbox `Claude` existia só para isso.

Decisão do usuário: "a verdade absoluta sempre será do Open Finance", "sempre
salvando em banco", cuidando da estabilidade, da performance, do sigilo dos
dados e do número de requisições, e sem nada mockado.

## Decisão

| Tema | Antes | Agora |
|---|---|---|
| Transações | Sync + manual + CSV | **Só o sync**. O usuário reclassifica (`PATCH /transactions/:id`: nome, categoria, forma de pagamento, essencial, recorrência, orçamento, observação) |
| Excluir transação | `DELETE` devolvia o valor ao saldo | Não existe. Some quando o banco remove (o sync apaga) |
| Contas | CRUD com saldo, conta padrão, sandbox | Nascem no sync. Só aparência editável (`PATCH /accounts/:id`) |
| Saldo / investimentos | Pluggy a cada leitura, cache em memória de 60 s / 5 min | **Retrato no Postgres** (`open_finance_snapshots`), prazo de 15 min / 1 h, gravado também no fim de cada sync |
| Pluggy fora do ar | "indisponível" | Último retrato com `stale: true` e a data; só "indisponível" se nunca houve retrato |
| Projeção sem Open Finance | Caía em `accounts.balance` | `openingBalanceSource: "unavailable"`, saldo inicial 0 e aviso |
| IA fake | `LLM_PROVIDER=mock` selecionável | Dublê só em `src/test/mocks/`; o app não aceita `mock` |
| Provedor fake do Open Finance | `modules/open-finance/providers/mock.ts` | Movido para `src/test/mocks/` |
| Seed | `db:seed` (contas + categorias), `db:seed:dev` (transações fake) | `db:seed` só com categorias; o dev foi apagado |
| Dados de teste | Conta sandbox `Claude` no banco de dev | Só no banco `finance_test` (suíte automatizada) |

### Estabilidade, performance e requisições

- Leitura de saldo/investimentos: uma linha do Postgres enquanto o retrato vale.
- O sync já busca as contas com saldo, então grava o retrato sem chamada extra.
- Investimentos (~30 chamadas) só vão à Pluggy se o retrato passou de 1 h.
- Chamadas simultâneas compartilham uma busca (single-flight por tipo).
- O cliente HTTP já tinha timeout de 20 s e retry com backoff para 429/5xx/rede.

### Sigilo

- A API escuta só em `127.0.0.1` (não tem autenticação).
- O retrato guarda números agregados e nomes de exibição — nada de credencial,
  token ou número completo de conta.
- Logs levam só a mensagem de erro; `log.ts` mascara chaves sensíveis.
- Backups do banco vão para `backups/`, que está no `.gitignore` junto de
  `NU_*.csv`.

## Migração (`api/scripts/migrate-open-finance-only.sql`)

1. Apaga os check-ups dos meses que contavam dado manual/CSV (fora de sandbox).
2. Apaga transações com `source <> 'open_finance'` e seus vínculos crus.
3. Apaga contas sem vínculo com a Pluggy e sem transação (Itaú, Mercado Pago,
   Claude).
4. Apaga as séries recorrentes não dispensadas (cache; o próximo sync recalcula).
5. Remove `accounts.balance`, `is_default`, `is_sandbox` e `sync_runs.adopted`.
6. Recria `transaction_source` só com `open_finance`; `external_id` passa a ser
   `NOT NULL`.
7. Cria `open_finance_snapshots`.

No banco de dev havia, em 2026-09-23: 4 linhas `csv` (proventos "Rendimento"
duplicados, ver `domain/open-finance.md`) e 7 `manual` na conta sandbox. Um
backup (`pg_dump`) e um CSV dessas linhas foram gerados em `backups/` antes da
migração.

## Alternativas descartadas

- **Manter o manual só como exceção** (dinheiro em espécie): reabriria as duas
  verdades. Se virar necessidade, entra como um segundo `transaction_source`
  com escopo próprio, não como edição livre.
- **Só cache em memória:** some a cada restart e não resolve a Pluggy fora do ar.
- **Persistir histórico de saldo** (uma linha por leitura): útil para gráfico de
  patrimônio, mas fora do escopo; o retrato atual é só a última foto.
