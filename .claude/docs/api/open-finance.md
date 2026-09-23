---
title: API — Open Finance
area: api
updated: 2026-09-23
---

## Visão geral

Plugin `openFinanceRoute` (`api/src/modules/open-finance/routes.ts`), prefixo
`/open-finance`. O sync em si está em `domain/open-finance.md`. Saldo e
investimentos ao vivo têm rotas próprias (ver abaixo, F5).

Sem `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` e `PLUGGY_ITEM_IDS` o módulo fica
**não configurado**: `/status` responde `configured: false` e `/sync` responde 400.
O resto do app funciona normalmente.

## Endpoints

| Método | Path | Descrição |
|---|---|---|
| GET | `/open-finance/status` | Estado da integração. **Com dados de mais de 6h (ou nunca sincronizados), dispara um sync em segundo plano**, a menos que venha `?autoSync=false` |
| POST | `/open-finance/sync` | Body opcional `{ full?, refresh?, dryRun? }`. Real → `202 { started: true }` e roda em segundo plano. `dryRun` → `200` com o `SyncReport`, sem gravar nada. `409` se outro processo estiver sincronizando |
| GET | `/open-finance/balances` | **Saldo ao vivo** (nunca persistido), cache de 60 s em memória; `?fresh=true` ignora o cache. Ver abaixo |
| GET | `/open-finance/investments` | **Investimentos ao vivo** (nunca persistidos), cache de 5 min; `?fresh=true` ignora. Ver abaixo |
| GET | `/open-finance/runs` | Histórico (`sync_runs`), mais recente primeiro. `?limit=` (máx. 100) |
| PATCH | `/open-finance/accounts/:id` | `{ accountId }` troca a conta interna de uma conta do provedor e move as transações que o sync trouxe dela. `400` para conta sandbox ou inexistente; `404` para vínculo inexistente |

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
               "adopted": 0, "removed": 0, "errorMessage": null, "startedAt": "…", "finishedAt": "…" }
}
```

`running` vale `true` enquanto um sync roda **neste processo**. A UI faz
polling do `/status` até ele virar `false`.

### `SyncReport` (dry-run)

```json
{ "runId": null, "dryRun": true, "full": true,
  "fetched": 1480, "created": 1150, "updated": 0, "adopted": 323, "removed": 0, "unchanged": 7,
  "accounts": [{ "accountName": "Nubank", "type": "BANK", "from": "2025-09-23",
                 "fetched": 511, "created": 181, "adopted": 323, "updated": 0, "removed": 0, "unchanged": 7 }] }
```

### `GET /open-finance/balances`

```json
{ "available": true, "error": null, "fetchedAt": "…", "cash": 773.86, "cardDebt": 11130.74,
  "accounts": [
    { "accountId": "uuid", "accountName": "Nubank", "providerAccountId": "…", "type": "BANK",
      "balance": 773.86, "creditLimit": null, "availableCredit": null, "dueDate": null, "minimumPayment": null },
    { "accountId": "uuid", "accountName": "Nubank Cartão", "type": "CREDIT", "balance": 11130.74,
      "creditLimit": 13500, "availableCredit": 973.26, "dueDate": "2026-09-08", "minimumPayment": 847.29 } ] }
```

- `balance`: na conta é o saldo disponível; no cartão é o **usado do limite**
  (inclui parcelas futuras).
- `available: false` quando não está configurado, quando nunca sincronizou (não
  há vínculo de contas) ou quando a Pluggy falhou (`error` traz o motivo). Falha
  não entra no cache.
- Medido com a conta real: ~300 ms sem cache.

`GET /accounts` ganhou `openFinance: boolean`, que indica conta vinculada (o
saldo mostrado vem daqui).

### `GET /open-finance/investments`

```json
{ "available": true, "error": null, "fetchedAt": "…",
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
- Medido com a conta real: ~540 ms sem cache (lista + movimentações de 18 ativos
  de renda variável).
