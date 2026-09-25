---
title: Domínio — Transação
area: domain
updated: 2026-09-23
---

## Visão geral

A transação é o módulo central do sistema e **vem só do Open Finance**: o sync
com a Pluggy é a única porta de entrada. Não existe lançamento manual nem
importação de extrato (removidos em 2026-09-23 — ver
`.claude/docs/decisions/open-finance-fonte-unica.md`). O usuário não cria nem
exclui transação; só ajusta a **classificação** dela.

Não há campo `type` nem entidade de transferência — despesa e entrada se
distinguem pelo **sinal de `amount`** (positivo = despesa, negativo = entrada).

## Campos

| Campo | Tipo | Dono | Descrição |
|-------|------|------|-----------|
| `id` | uuid | — | PK gerada |
| `amount` | numeric(10,2) | banco | Positivo = despesa; negativo = entrada |
| `date` | date | banco | Data local da transação |
| `accountId` | uuid FK → accounts | banco | Conta vinculada à conta da Pluggy (troca só pelo religar, ver `domain/open-finance.md`) |
| `status` | enum `posted` \| `pending` | banco | Pendentes: fatura aberta e parcelas futuras do cartão |
| `kind` | enum `transaction_kind` | banco | `regular` \| `bill_payment` \| `investment` \| `own_transfer` — ver "Movimentos internos" |
| `source` | enum `transaction_source` | — | Só `open_finance` (default). O enum existe para um eventual segundo agregador |
| `externalId` | varchar, **obrigatório**, único | banco | Id da transação na Pluggy — chave de idempotência do sync |
| `originalName` | varchar(255) | banco | Nome oficial do extrato (`displayName` da Pluggy), antes de regras e edições. O sync regrava a cada rodada; nunca é editável. Base do botão "Restaurar nome" |
| `name` | varchar(255) | usuário | Nome exibido (nasce de `originalName`, ajustado pelas regras; editável) |
| `categoryId` | uuid FK → categories | usuário | Categoria |
| `paymentMethod` | enum `payment_method` | usuário | Forma de pagamento (lista fixa, ver abaixo) |
| `isEssential` | boolean | usuário | Gasto essencial. Entrada (amount < 0) é sempre `false` |
| `recurrence` | enum `fixed` \| `variable` | usuário | Fixo (recorrente) ou variável |
| `budgetId` | uuid FK → budgets | usuário | Obrigatório se `recurrence = fixed`; nulo se `variable` (ver `domain/budget.md`) |
| `notes` | text | usuário | Observação livre |

"Banco" = o sync sobrescreve a cada sincronização. "Usuário" = nasce da
classificação automática e o sync **nunca** sobrescreve depois.

## Regras de negócio

### Reclassificação é a única escrita do usuário
`PATCH /transactions/:id` aceita só os campos do usuário. Valor, data, conta,
status e natureza não são editáveis — são o extrato real. Não existe criar nem
excluir: uma transação some quando o banco a remove (o sync apaga o que sumiu
da janela buscada).

### Entradas
- `amount > 0` → despesa (ícone `ArrowDownRight`); `amount < 0` → entrada
  (`ArrowUpRight`, verde `FINANCE.income`).
- Entrada nunca é essencial: o PATCH grava `isEssential = amount >= 0 and <valor enviado>`.
- `GET /dashboard/summary` é um painel só de despesas (filtra `amount > 0`);
  `recentTransactions` mostra as duas.

### Saldo
Transação **não mexe em saldo**. `accounts` não tem mais coluna `balance`: o
saldo é o que o Open Finance reporta, guardado no retrato
`open_finance_snapshots` (ver `domain/open-finance.md`).

### Escopo das análises
Filtros em `api/src/lib/scope.ts`:
- `REAL_TRANSACTIONS` — `source = 'open_finance'`. Usado pela listagem, kNN da
  classificação e transações recentes. Hoje toda linha passa, mas o filtro
  explícito garante que nada de fora (um insert à mão no Postgres) apareça.
- `COUNTED_TRANSACTIONS` — `REAL_TRANSACTIONS` + `kind = 'regular'`. Toda
  consulta analítica (dashboard, check-up, projeção, recorrências) usa este.

### Movimentos internos (`kind`)
Só `kind = regular` entra nas análises. Os demais aparecem na listagem (selo
"Interno"), mas são dinheiro mudando de lugar entre contas do próprio usuário:
- `bill_payment` — pagamento da fatura na conta e "pagamento recebido" no cartão;
  contá-lo duplicaria as compras já detalhadas no cartão.
- `investment` — aplicação/resgate (RDB) e compra/venda de ativos.
- `own_transfer` — transferência entre contas do mesmo titular.

Proventos e rendimentos continuam `regular`: são renda de verdade.

### Forma de pagamento — lista fixa
`transactions.payment_method` é o enum Postgres `payment_method`, sem tabela:

| Valor | Label | Cor |
|---|---|---|
| `credit_card` | Cartão de crédito | `#ef4444` |
| `debit_card` | Cartão de débito | `#3b82f6` |
| `pix` | Pix | `#06b6d4` |
| `cash` | Dinheiro | `#10b981` |
| `boleto` | Boleto | `#f59e0b` |
| `transfer` | Transferência | `#8b5cf6` |

- Backend: `api/src/lib/payment-methods.ts`. Frontend: mesmos labels/cores em
  `app/src/types/finance.ts` — manter os dois em sincronia.
- No cartão o sync grava sempre `credit_card`; na conta, a regra aprendida ou a
  inferência da normalização decide.
- Mudar a lista exige migração do enum.

## Histórico

- 2026-07-01 — modelo `type` INCOME/EXPENSE/TRANSFER substituído pelo sinal de
  `amount`; bancos e formas de pagamento deixam de ser CRUD.
- 2026-09-23 — carteiras removidas (ver `decisions/remocao-carteiras.md`).
- 2026-09-23 — Open Finance vira fonte única: saem lançamento manual,
  importação CSV, `accounts.balance`, conta padrão e conta sandbox.
