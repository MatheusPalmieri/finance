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
