---
title: API — Open Finance
area: api
updated: 2026-09-30
---

## Visão geral

Plugin `openFinanceRoute` (`api/src/modules/open-finance/routes.ts`), prefixo
`/open-finance`. O sync em si e o cache persistente estão em
`domain/open-finance.md`. Saldos e investimentos são servidos do último retrato
salvo no banco (`open_finance_snapshots`); a Pluggy só é chamada quando o
retrato vence ou com `?fresh=true`.

Sem `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` e `PLUGGY_ITEM_IDS` o módulo fica
**não configurado**: `/status` responde `configured: false` e `/sync` responde 400.
O resto do app funciona normalmente.

## Endpoints

| Método | Path | Descrição |
|---|---|---|
| GET | `/open-finance/status` | Estado da integração. **Com dados de mais de 6h (ou nunca sincronizados), dispara um sync em segundo plano**, a menos que venha `?autoSync=false` |
| POST | `/open-finance/sync` | Body opcional `{ full?, refresh?, dryRun? }`. Real → `202 { started: true }` e roda em segundo plano. `dryRun` → `200` com o `SyncReport`, sem gravar nada. `409` se outro processo estiver sincronizando |
| GET | `/open-finance/balances` | Retrato de saldos: do banco até 15 min; vencido ou `?fresh=true`, busca na Pluggy e grava. Ver abaixo |
| GET | `/open-finance/investments` | Retrato de investimentos: mesmo fluxo, prazo de 1 h |
| GET | `/open-finance/runs` | Histórico (`sync_runs`), mais recente primeiro. `?limit=` (máx. 100) |
| PATCH | `/open-finance/accounts/:id` | `{ accountId }` troca a conta interna de uma conta do provedor e move as transações que o sync trouxe dela. `400` para conta inexistente; `404` para vínculo inexistente |

### `GET /open-finance/status`

```json
{
  "configured": true,
  "running": false,
  "stale": false,
  "startedBackgroundSync": false,
  "lastSyncedAt": "2026-09-23T21:00:00.000Z",
  "items": [{ "itemId": "…", "connectorName": "Nubank", "status": "UPDATED",
              "providerUpdatedAt": "…", "lastSyncedAt": "…", "lastFullSyncAt": "…" }],
  "accounts": [{ "id": "uuid", "providerAccountId": "…", "type": "BANK", "subtype": "CHECKING_ACCOUNT",
                 "name": "…", "number": "…", "accountId": "uuid", "accountName": "Nubank" }],
  "lastRun": { "status": "success", "trigger": "stale", "created": 3, "updated": 1,
               "removed": 0, "errorMessage": null, "startedAt": "…", "finishedAt": "…" }
}
```

`running` vale `true` enquanto um sync roda **neste processo**. A UI faz
polling do `/status` até ele virar `false`.

### `SyncReport` (dry-run)

```json
{ "runId": null, "dryRun": true, "full": true,
  "fetched": 1480, "created": 3, "updated": 1, "removed": 0, "unchanged": 1476,
  "accounts": [{ "accountName": "Nubank", "type": "BANK", "from": "2025-09-23",
                 "fetched": 511, "created": 2, "updated": 1, "removed": 0, "unchanged": 508 }] }
```

### `GET /open-finance/balances`

Exemplo real (2026-10-01): a fatura de outubro ainda não estava no `/bills`; a
estimativa (compras + saldo anterior) bateu com os R$ 6.861,15 do banco.

```json
{ "available": true, "source": "cache", "stale": false, "error": null,
  "fetchedAt": "2026-09-23T21:00:00.000Z", "cash": 773.86, "cardDebt": 11130.74,
  "accounts": [
    { "accountId": "uuid", "accountName": "Nubank", "providerAccountId": "…", "type": "BANK",
      "balance": 773.86, "creditLimit": null, "availableCredit": null, "dueDate": null, "minimumPayment": null },
    { "accountId": "uuid", "accountName": "Nubank Cartão", "type": "CREDIT", "balance": 11130.74,
      "creditLimit": 13500, "availableCredit": 973.26, "dueDate": "2026-09-08", "minimumPayment": 847.29,
      "bill": { "month": "2026-10", "official": false, "total": 6861.15, "itemized": 6734.65,
                "carriedOver": 126.5, "undetailed": 0, "dueDate": null, "closingDate": null,
                "minimumPayment": null } } ] }
```

- `balance`: na conta é o saldo disponível; no cartão é o **usado do limite**
- `bill` (só cartão): a **fatura a pagar** (substituiu `monthBill` em 2026-09-30).
  - `month`: o menor `billForecastDate` com lançamento `regular` e `pending` = mês do vencimento.
  - `itemized`: soma desses lançamentos (compras menos estornos; pagamento de fatura e parcelas futuras ficam fora).
  - `carriedOver` (saldo anterior): valor oficial da fatura do mês anterior (`/bills`) **mais** os pagamentos recebidos no ciclo (`kind = bill_payment` com o mesmo `billForecastDate`, negativos). Pagou tudo → 0; pagou a menos → o resto entra nesta fatura; pagou a mais → negativo. Sem a fatura anterior no `/bills` → 0. Conferido de fev a out/2026: o pagamento de cada ciclo é exatamente a fatura anterior, exceto em outubro (R$ 126,50 em aberto: o estorno do Sympla abatido no pagamento de setembro).
  - Se `GET /bills` da Pluggy já tem a fatura daquele mês (fechada pelo banco): `official: true`, `total` = valor oficial, `dueDate`/`closingDate`/`minimumPayment` dela e `undetailed = total − itemized − carriedOver` — o que o banco cobra sem ter mandado o lançamento (por exemplo, parcela que não veio).
  - Senão: `official: false`, `total = itemized + carriedOver` (estimativa), `undetailed: 0`, e `dueDate` só se o vencimento da conta for desse mês.
  - `/bills` fora do ar não derruba o retrato: a fatura fica como estimativa.
  - `balance` é a dívida total, com as parcelas a vencer, e não é o que vence agora.
  - Retratos antigos não têm o campo até o próximo sync.
- As faturas são buscadas no sync (fase de rede, junto das contas) e na leitura de retrato vencido.
  (inclui parcelas futuras).
- Metadados do retrato (valem também para `/investments`):

  | Campo | Significado |
  |---|---|
  | `source` | `live` = buscado agora; `cache` = do banco; `none` = sem dado |
  | `stale` | `true` quando a Pluggy falhou e o dado é o último conhecido |
  | `error` | Motivo da última falha, ou `null` |
  | `fetchedAt` | Quando a **Pluggy** devolveu o dado (não quando foi lido) |
  | `available` | `false` só sem retrato nenhum e com a Pluggy falhando (não configurado, nunca sincronizou, fora do ar) — valores zerados, nunca inventados |

- Medido com a conta real: ~300 ms indo à Pluggy; do banco, poucos ms.

`GET /accounts` traz `openFinance: boolean`, que indica conta vinculada.

### `GET /open-finance/investments`

```json
{ "available": true, "source": "cache", "stale": false, "error": null, "fetchedAt": "…",
  "total": 50527.13, "invested": 49199.8, "profit": 1327.33, "liquid": 42046.21,
  "byClass": [{ "assetClass": "Renda fixa", "total": 42046.21, "pct": 83.22, "count": 12 }, …],
  "positions": [{ "id": "…", "name": "WEGE3", "code": "WEGE3", "type": "EQUITY", "subtype": "STOCK",
                  "assetClass": "Ações", "balance": 2072, "invested": 1856.8, "profit": 215.2, "profitPct": 11.59,
                  "quantity": 40, "price": 51.8, "averagePrice": 46.42, "taxes": null, "rate": null,
                  "rateType": null, "dueDate": null, "issuer": null, "liquid": false, "incomeLast12m": 0 }, …],
  "income": { "last12m": 76.27, "byMonth": [{ "month": "2026-08", "total": 31.48 }, …] } }
```

Regras em `modules/open-finance/investments.ts`:
- Só posições com saldo > 0: os CDBs resgatados (cada aplicação RDB vira um)
  ficam de fora.
- **Renda fixa:** `invested` = `amountOriginal`, `balance` já sem IR, `taxes` =
  IR retido.
- **Renda variável:** `invested` e `averagePrice` pelo **custo médio** das
  movimentações BUY/SELL, porque a Pluggy não manda o aplicado.
- `incomeLast12m` / `income`: movimentações `INTEREST` (proventos).
- `liquid`: renda fixa sem carência (`gracePeriodDate` passada ou ausente). É
  somado ao caixa da projeção.
- Medido com a conta real: ~540 ms indo à Pluggy (lista + movimentações de 18
  ativos de renda variável) — por isso o prazo do retrato é de 1 h.
