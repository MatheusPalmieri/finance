---
title: Domínio — Open Finance (sync com a Pluggy)
area: domain
updated: 2026-09-23
---

## Visão geral

O Open Finance (Pluggy) é a **fonte primária** das transações (spec 04). O sync
(`api/src/modules/open-finance/sync.ts`) lê o provedor e projeta tudo em
`transactions`, a mesma tabela que o CSV e o lançamento manual usam. Por isso
classificação, check-up, projeção e recorrências funcionam sem nenhum caminho
especial.

**Saldo e investimentos não passam pelo sync:** são sempre buscados ao vivo.

## Módulo

| Arquivo | Papel |
|---|---|
| `provider.ts` | Interface `OpenFinanceProvider`, `getProvider()`, `isConfigured()`, `__setProvider()` (testes) |
| `providers/pluggy.ts` | Cliente real: `/auth` com cache de ~90 min, `/items`, `/accounts`, `/v2/transactions` (cursor), `/investments` |
| `providers/mock.ts` | Provedor em memória para testes |
| `normalize.ts` | Tradução pura do payload: data local, sinal, `kind`, status, nome, forma de pagamento, categoria |
| `sync.ts` | Motor: busca → payload cru → `transactions` |
| `http.ts` / `log.ts` | Retry com backoff (429/5xx/rede) e log que mascara segredos |

## Normalização (`normalize.ts`)

| Campo | Regra |
|---|---|
| `date` | ISO UTC da Pluggy → dia em `America/Sao_Paulo` |
| `amount` | `type === "DEBIT"` → `+|v|` (despesa); `CREDIT` → `-|v|` (entrada). O sinal cru da Pluggy se inverte entre conta e cartão; o `type` não |
| `status` | `PENDING` → `pending`; o resto → `posted` |
| `kind` | Fatura (`05100000` ou "Pagamento de fatura/recebido") → `bill_payment`; RDB e compra/venda de ativos (texto ou categoria `03*`) → `investment`; `04000000` Same person transfer → `own_transfer`; o resto → `regular` |
| `name` | "Transferência enviada\|X" → "Pix para X"; "Tipo\|X" → "Tipo - X". É o formato do extrato CSV, então as regras e o histórico existentes continuam valendo (ex.: a regra de salário) |
| `paymentMethod` | Cartão → `credit_card`; conta → `paymentData` (PIX/BOLETO/TED), senão o texto ("Compra no débito" → `debit_card`) |
| categoria | Só quando regra/histórico/IA não resolvem: mapa da categoria da Pluggy (prefixo mais longo) para o nome local; sem mapa → "Outros" |

## Regras do sync

1. **Rede primeiro, banco depois.** Busca item, contas e transações; só então abre
   a transação do banco. Com `refresh`, pede nova coleta ao banco
   (`PATCH /items/{id}`) e espera até 2 min o item sair de `UPDATING`.
2. **Janela.** Completa (365 dias) na primeira vez, a cada 7 dias ou com `full`;
   senão incremental a partir de `last_synced_at − 7 dias`.
3. **Vínculo de contas.** Conta corrente → conta interna com o nome do conector
   ("Nubank"); cartão → "Nubank Cartão" (`CREDIT_CARD`). Cria se não existir.
   Fica em `pluggy_accounts`.
4. **Para cada transação do provedor, nesta ordem:**
   - já conhecida pelo `external_id` → atualiza só os **campos do banco**
     (`amount`, `date`, `status`, `kind`);
   - id novo, mas uma linha da janela sumiu com o mesmo valor e até 5 dias de
     diferença → **religa** (a Pluggy recria a transação ao mudar, por exemplo de
     pendente para lançada);
   - linha de CSV/manual da mesma conta, sem vínculo, mesmo valor e até 1 dia de
     diferença → **adota** (vira `open_finance`, mantém a classificação);
   - senão → insere, com a classificação em 3 camadas (IA desligada por padrão:
     `OPEN_FINANCE_SYNC_USE_AI=true` liga).
5. **Campos do usuário nunca são sobrescritos:** nome, categoria, forma de
   pagamento, essencial, recorrência, orçamento e observação.
6. **Removidas:** o que sumiu da janela é apagado, a menos que o provedor devolva
   a conta **vazia** (mais provável ser falha que extrato vazio).
7. **Saldo das contas não é tocado.**
8. **Um sync por vez:** `pg_try_advisory_xact_lock` entre processos (o segundo
   recebe `SyncBusyError`) e, no mesmo processo, chamadas simultâneas recebem o
   mesmo resultado.
9. **`dryRun`:** roda o mesmo caminho dentro da transação e desfaz no fim. O
   relatório é fiel e nada é gravado, nem o `sync_run`.
10. **Depois do sync:** grava `sync_runs` (contadores ou erro) e agenda o
    recálculo das recorrências.

## Parcelas futuras

O cartão traz as próximas parcelas como `pending` com data futura. Elas ficam em
`transactions` e a projeção (spec 03) já as trata como transações conhecidas do
mês em que caem (`knownTransactions`). O dashboard e o check-up do mês corrente
não as veem, porque a data está no futuro.
