# Domínio — Open Finance (somente leitura)

Integração de **leitura** de contas, saldos e transações bancárias via provedor
agregador regulado (**Pluggy** — ver `docs/open-finance-decision.md`). Não há
pagamento, Pix, iniciação de transação nem compartilhamento com terceiros.

## Princípios

- **Não substitui nada.** As transações manuais e as importadas por CSV
  continuam intactas. Os dados externos vivem em tabelas próprias `open_finance_*`
  e **nunca** são inseridos em `transactions`.
- **Idempotência** pelo `providerTransactionId` (identificador original no
  provedor). Reimportar o mesmo período não duplica.
- **Auditoria**: todo registro externo guarda o `raw_payload` do provedor para
  reprocessamento.
- **Sem credenciais bancárias**: senhas/tokens nunca são persistidos. O backend
  guarda só o `providerItemId` e metadados públicos. Logs mascaram qualquer
  chave sensível (`api/src/modules/open-finance/log.ts`).
- **Multiusuário futuro**: `open_finance_connections.user_id` já existe (nullable,
  sempre `null` hoje).

## Entidades (`api/src/db/schema.ts`)

| Tabela | Papel |
|---|---|
| `open_finance_connections` | Conexão ("item") com um banco. `provider_item_id` único. `status`: PENDING/UPDATING/ACTIVE/LOGIN_ERROR/ERROR/DELETED. |
| `open_finance_accounts` | Conta externa. `provider_account_id` único. `linked_account_id` → `accounts.id` (opcional, **nunca** criado automaticamente). |
| `open_finance_transactions` | Transação externa. `provider_transaction_id` único. `amount` já **normalizado** ao modelo do projeto. `direction` (INFLOW/OUTFLOW), `status` e `category` preservados da origem. |
| `open_finance_sync_runs` | Histórico de cada sincronização: contadores, `status`, `error_message`, `trigger` (INITIAL/MANUAL/WEBHOOK). |

## Normalização de valor

Convenção do provedor: negativo = saída. Convenção do projeto: **positivo =
despesa** (reduz saldo), negativo = entrada. A regra é `projectAmount = -providerAmount`
(`normalize.ts`, coberto por `normalize.test.ts`). `direction` guarda o sentido
original independentemente do sinal.

## Sincronização

1. `getConnection` no provedor → atualiza `status`.
2. `listAccounts` → upsert em `open_finance_accounts` por `provider_account_id`.
3. Para cada conta: `listTransactions` (incremental a partir de
   `last_synced_at − 5 dias`) — na Pluggy é `GET /v2/transactions` com paginação
   por **cursor** (`after` / `next`), page size fixo de 500. `planSync()` separa
   inserts de updates pelo id do provedor, grava em lote com `onConflictDoNothing`
   (corrida com webhook).
4. Atualiza `last_synced_at` e fecha o `sync_run` com contadores.

Falhas: paginação com teto de 60 páginas/conta, timeout de 20s por request e
retry com backoff só para 429/5xx/rede (`http.ts`). Erro numa sync marca o
`sync_run` como ERROR sem derrubar a conexão.
