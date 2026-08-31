# API — Open Finance

Plugin Elysia `api/src/modules/open-finance/routes.ts`, prefixo `/open-finance`.
Todos os endpoints são **somente leitura** do ponto de vista bancário (não
movimentam dinheiro). Toda chamada ao provedor sai do backend.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/open-finance/connections` | Registra uma conexão e dispara a sync inicial. Body: `{ itemId?, connectorId?, parameters? }`. Use `itemId` (gerado pelo widget do provedor) **ou** `connectorId` + `parameters` (sandbox). `parameters` vai direto ao provedor e não é persistido. |
| `GET` | `/open-finance/connections` | Lista conexões com contas e a última execução de sync. |
| `DELETE` | `/open-finance/connections/:id` | Desconecta no provedor e remove localmente (cascade em contas/transações/syncs). |
| `POST` | `/open-finance/connections/:id/sync` | Sincronização manual. Retorna o `sync_run`. |
| `GET` | `/open-finance/connections/:id/transactions` | Transações externas da conexão. Query: `page`, `limit` (máx. 200), `from`, `to` (YYYY-MM-DD). |
| `POST` | `/open-finance/webhooks` | Recebe eventos do provedor. Responde 200 rápido e sincroniza em background. Se `OPEN_FINANCE_WEBHOOK_SECRET` estiver definido, exige header `x-webhook-secret` (ou `?secret=`). |

## Variáveis de ambiente (`api/.env`)

| Var | Default | Uso |
|---|---|---|
| `OPEN_FINANCE_PROVIDER` | `pluggy` | `pluggy` ou `mock` (dados falsos, sem rede). |
| `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` | — | Credenciais da app Pluggy. Só backend. |
| `PLUGGY_BASE_URL` | `https://api.pluggy.ai` | Override da API. |
| `OPEN_FINANCE_DEFAULT_CONNECTOR_ID` | `2` | Conector usado quando `connectorId` não é enviado (`2` = Pluggy Bank sandbox). |
| `OPEN_FINANCE_WEBHOOK_SECRET` | vazio | Se preenchido, valida o webhook. |

## Provider interface

`api/src/modules/open-finance/provider.ts` define `OpenFinanceProvider`. Trocar
de agregador = nova implementação + registro em `getProvider()`. Nenhuma mudança
em schema/rotas/serviço/frontend. Implementações: `providers/pluggy.ts`,
`providers/mock.ts`.

## Testes

`bun test` em `api/`:
- `normalize.test.ts` — normalização de valor/data e `planSync` (dedupe + idempotência).
- `sync.test.ts` — ciclo de sincronização com `MockProvider`.
