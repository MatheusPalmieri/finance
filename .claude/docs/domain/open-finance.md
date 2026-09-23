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

## Conciliação com o histórico (F4)

- **Adoção no sync** (regra 4 acima): linha de CSV/manual da mesma conta, mesmo
  valor absoluto e até 1 dia de diferença vira a transação do Open Finance,
  mantendo nome, categoria, orçamento e observação.
- **Caminho inverso:** `POST /transactions/bulk` (ImportModal) e
  `bun run import:csv` pulam as linhas que o Open Finance já trouxe
  (`modules/open-finance/dedupe.ts`, mesma regra de casamento). O bulk responde
  `{ created, skipped }` e o toast mostra quantas foram puladas. Lote com
  `source: "manual"` nunca é pulado.

### Primeira sincronização real (2026-09-23)

| Conta | Lidas | Novas | Adotadas do CSV |
|---|---|---|---|
| Nubank (conta) | 511 | 188 | **323** (das 327 linhas do CSV) |
| Nubank Cartão | 969 | 969 | — |

- 2,9 s para a janela completa. O incremental e o completo seguintes rodaram com
  0 mudanças (idempotente).
- Das 969 do cartão, só 41 caíram em "Outros". O resto foi resolvido por regra,
  histórico ou mapa de categoria da Pluggy.
- As 188 novas na conta são set a out/25, março/26 (extrato nunca importado) e
  micro-movimentos de RDB que o CSV não trazia.

### Limitação conhecida: proventos agrupados no CSV

O extrato CSV do Nubank **agrupa** os proventos do dia numa linha "Rendimento";
a Pluggy manda um por ativo ("Valor recebido de Investimentos"). Os valores não
casam um a um, então nem a adoção nem o dedupe os reconhecem. Na primeira
sincronização sobraram 4 linhas `csv` "Rendimento" (07, 14 e 19/08/2026,
R$ 23,40 no total) cuja soma por dia bate ao centavo com as linhas da Pluggy: são
duplicatas de renda. Remover:

```sql
delete from transactions
where source = 'csv' and name = 'Rendimento'
  and date in ('2026-08-07', '2026-08-14', '2026-08-19');
```

Para os extratos futuros, o caminho é não importar por CSV o que o Open Finance
já cobre.

### Check-ups salvos depois do primeiro sync

Os relatórios mensais são snapshots: os de antes do Open Finance contavam a
fatura e as aplicações como gasto. Em 2026-09-23 foram regerados
(`bun run report:monthly 2026-01|02|08`). Agosto passou de +R$ 33,8 mil para
−R$ 2,2 mil (inclui um pagamento real de R$ 15,4 mil à Santander
Financiamentos). Ao mudar muito o histórico, regerar pelo botão da página
Check-up ou pelo script.

"Valor recebido de Investimentos" mistura proventos e a devolução do troco de
compras na corretora (centavos a poucos reais). Fica `regular`: a distorção é
irrelevante e separar exigiria cruzar com as movimentações de investimento.
