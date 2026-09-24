---
title: Domínio — Open Finance (sync com a Pluggy)
area: domain
updated: 2026-09-23
---

## Visão geral

O Open Finance (Pluggy) é a **única fonte de verdade** do app (desde
2026-09-23, ver `decisions/open-finance-fonte-unica.md`). Não existe lançamento
manual nem importação de extrato. O sync (`api/src/modules/open-finance/sync.ts`)
lê o provedor e projeta tudo em `transactions`; classificação, check-up,
projeção e recorrências leem dali.

**Todo dado vindo da Pluggy é gravado no banco** e servido de lá: transações
pelo sync, saldos e investimentos como retrato em `open_finance_snapshots` (ver
"Cache persistente"). A Pluggy só é chamada quando o dado vence. Com ela fora do
ar, o app mostra o último dado real marcado como desatualizado. Nada é mockado
nem digitado.

## Módulo

| Arquivo | Papel |
|---|---|
| `provider.ts` | Interface `OpenFinanceProvider`, `getProvider()`, `isConfigured()`, `__setProvider()` (testes) |
| `providers/pluggy.ts` | Cliente real: `/auth` com cache de ~90 min, `/items`, `/accounts`, `/v2/transactions` (cursor), `/investments` |
| `balances.ts` / `investments.ts` | Montam os retratos de saldo e de investimentos a partir da Pluggy |
| `snapshots.ts` | Cache persistente: leitura com prazo, gravação, último conhecido quando a Pluggy falha |
| `src/test/mocks/open-finance.ts` | Dublê em memória — **só testes**; o app em execução sempre usa a Pluggy |
| `normalize.ts` | Tradução pura do payload: data local, sinal, `kind`, status, nome, forma de pagamento, categoria |
| `sync.ts` | Motor: busca → payload cru → `transactions` |
| `http.ts` / `log.ts` | Retry com backoff (429/5xx/rede) e log que mascara segredos |

## Normalização (`normalize.ts`)

| Campo | Regra |
|---|---|
| `date` | ISO UTC da Pluggy → dia em `America/Sao_Paulo` |
| `amount` | `type === "DEBIT"` → `+|v|` (despesa); `CREDIT` → `-|v|` (entrada). O sinal cru da Pluggy se inverte entre conta e cartão; o `type` não |
| `status` | `PENDING` → `pending`; o resto → `posted` |
| `kind` | Fatura (`05100000` ou "Pagamento de fatura/recebido") → `bill_payment`; RDB e compra/venda de ativos — inclusive "Compra de Renda Variável", que a Pluggy categoriza como Shopping — (texto ou categoria `03*`) → `investment`; `04000000` Same person transfer → `own_transfer`; o resto → `regular` |
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
   - senão → insere, com a classificação em 3 camadas (IA desligada por padrão:
     `OPEN_FINANCE_SYNC_USE_AI=true` liga).
5. **Campos do usuário nunca são sobrescritos:** nome, categoria, forma de
   pagamento, essencial, recorrência, orçamento e observação.
6. **Removidas:** o que sumiu da janela é apagado, a menos que o provedor devolva
   a conta **vazia** (mais provável ser falha que extrato vazio).
7. **Retrato de saldos:** terminado com sucesso (não em `dryRun`), grava
   `open_finance_snapshots.balances` com as contas já buscadas.
8. **Um sync por vez:** `pg_try_advisory_xact_lock` entre processos (o segundo
   recebe `SyncBusyError`) e, no mesmo processo, chamadas simultâneas recebem o
   mesmo resultado.
9. **`dryRun`:** roda o mesmo caminho dentro da transação e desfaz no fim. O
   relatório é fiel e nada é gravado, nem o `sync_run`.
10. **Depois do sync:** grava `sync_runs` (contadores ou erro), agenda o
    recálculo das recorrências e atualiza o retrato de investimentos se vencido.

## Parcelas futuras

O cartão traz as próximas parcelas como `pending` com data futura. Elas ficam em
`transactions` e a projeção (spec 03) já as trata como transações conhecidas do
mês em que caem (`knownTransactions`). O dashboard e o check-up do mês corrente
não as veem, porque a data está no futuro.

## Cache persistente (`open_finance_snapshots`)

O banco é o cache do Open Finance. Transações ficam em `transactions` (sync);
saldos e investimentos ficam como **retrato** em `open_finance_snapshots` — uma
linha por tipo (`balances`, `investments`) com `payload jsonb` e `fetched_at`
(quando a Pluggy devolveu o dado). Módulo: `modules/open-finance/snapshots.ts`.

Fluxo de leitura (`getSnapshot`):

1. Retrato dentro do prazo e sem `fresh` → devolve do banco (`source: "cache"`).
2. Vencido, ausente ou `fresh` → busca na Pluggy, grava e devolve
   (`source: "live"`). Chamadas simultâneas compartilham uma busca e uma gravação.
3. Pluggy falhou → devolve o último retrato com `stale: true` e `error`; sem
   retrato nenhum → `available: false`, `source: "none"`, valores zerados.

| Tipo | Prazo (`TTL_MS`) | Quando é gravado |
|---|---|---|
| `balances` | 15 min | No fim de todo sync bem-sucedido, com as contas que ele **já buscou** (sem chamada extra), e em toda leitura que vai à Pluggy |
| `investments` | 1 h | Leitura que vai à Pluggy; depois de cada sync, em segundo plano, **só se vencido** (são ~30 chamadas) |

Por quê (decisão de 2026-09-23, ver `decisions/open-finance-fonte-unica.md`):
- **Estabilidade** — Pluggy fora do ar ou sem rede não apaga a tela: o app
  mostra o último dado real, sempre dizendo de quando é.
- **Performance** — abrir o app lê uma linha do Postgres, não a Pluggy.
- **Menos requisições** — o saldo sai de graça do sync.

Dado sigiloso:
- O retrato guarda só números agregados e nomes de exibição — nunca credencial,
  token ou número completo de conta.
- Logs levam só a mensagem de erro, nunca o payload (`log.ts` ainda mascara
  chaves sensíveis).
- A API escuta só em `127.0.0.1` (`src/index.ts`): não tem autenticação, então
  não pode ficar exposta na rede.
- Backups do banco vão para `backups/` (no `.gitignore`).

## Histórico: conciliação com o CSV (F4, removida)

Até 2026-09-23 o sync **adotava** linhas de CSV/manuais (mesma conta, mesmo
valor, até 1 dia) e o `POST /transactions/bulk` pulava o que o sync já trouxe
(`dedupe.ts`). Com o Open Finance como fonte única, os dois caminhos saíram, e o
contador `adopted` também (`sync_runs.adopted` foi removida). Na primeira
sincronização real, 323 das 327 linhas do CSV da conta foram adotadas. As 4
restantes eram linhas "Rendimento" que o CSV agrupava por dia; elas saem na
migração `scripts/migrate-open-finance-only.sql`.

### Primeira sincronização real (2026-09-23)

| Conta | Lidas | Novas | Adotadas do CSV |
|---|---|---|---|
| Nubank (conta) | 511 | 188 | 323 (das 327 linhas do CSV) |
| Nubank Cartão | 969 | 969 | — |

- 2,9 s para a janela completa; incrementais seguintes com 0 mudanças.
- Das 969 do cartão, só 41 caíram em "Outros".

### Check-ups salvos

Os relatórios mensais são retratos: ao mudar muito o histórico, regerar pelo
botão da página Check-up ou por `bun run report:monthly YYYY-MM`. A migração
apaga os check-ups dos meses que contavam dado manual/CSV.

"Valor recebido de Investimentos" mistura proventos e a devolução do troco de
compras na corretora (centavos a poucos reais). Fica `regular`: a distorção é
irrelevante e separar exigiria cruzar com as movimentações de investimento.
