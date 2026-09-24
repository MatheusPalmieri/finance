---
title: API — Transações, Contas e Dashboard
area: api
updated: 2026-09-23
---

## Visão geral

Transações e contas são **somente leitura na origem**: tudo nasce do sync do
Open Finance (ver `api/open-finance.md`). A API expõe listagem, a
reclassificação das transações e a aparência das contas. Não existe criar,
importar nem excluir transação, nem criar/excluir conta ou digitar saldo.

## Transações — `api/src/routes/transactions.ts` (prefixo `/transactions`)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/transactions` | Lista paginada com filtros; traz `account`, `category`, `budget` |
| GET | `/transactions/:id` | Busca por ID (com relations) |
| PATCH | `/transactions/:id` | Reclassifica — só os campos do usuário |

`POST /transactions`, `POST /transactions/bulk`, `PUT` e `DELETE` foram
removidos (respondem 404).

**Query params de GET:** `page`, `limit` (máx 100), `search` (ilike em `name`),
`categoryId`, `paymentMethod` (valor fora do enum é ignorado), `accountId`,
`recurrence` (`fixed`\|`variable`), `isEssential` (`true`\|`false`), `from`,
`to`. Resposta: `{ data, total, page, limit }`. Sempre com `REAL_TRANSACTIONS`
(`source = 'open_finance'`).

**Body do PATCH:**
```json
{
  "name": "Supermercado",
  "categoryId": "uuid",
  "paymentMethod": "credit_card",
  "isEssential": true,
  "recurrence": "variable",
  "budgetId": null,
  "notes": null
}
```
- `amount`, `date`, `accountId` no corpo são descartados pela validação — são
  do banco.
- `recurrence = fixed` sem `budgetId` → 400; `variable` força `budgetId = null`.
- Entrada (amount < 0) nunca vira essencial, mesmo com `isEssential: true`.
- Dispara `scheduleRecalculate()` (recorrências), pois renomear muda a chave do
  estabelecimento.
- 404 se a transação não existe.

## Contas — `api/src/routes/accounts.ts` (prefixo `/accounts`)

Contas nascem no sync (`ensureAccountLink` em `modules/open-finance/sync.ts`).

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/accounts` | Lista, com `openFinance: boolean` (tem vínculo em `pluggy_accounts`) |
| GET | `/accounts/:id` | Busca por ID |
| PATCH | `/accounts/:id` | Só aparência: `name?`, `color?` (`#rrggbb`), `icon?` |

Não há `balance`, `isDefault` nem `isSandbox`. `POST`, `PUT`, `DELETE` e
`GET /accounts/default` foram removidos. O saldo é
`GET /open-finance/balances`.

## Dashboard — `api/src/routes/dashboard.ts` (`GET /dashboard/summary`)

Painel só de despesas: as agregações filtram `amount > 0` e usam
`COUNTED_TRANSACTIONS` (Open Finance + `kind = regular`). `recentTransactions`
usa `REAL_TRANSACTIONS` e mostra despesas e entradas. Query params `month`,
`year` (default: mês atual). Resposta:

```jsonc
{
  "totalExpenses": "1699.51",
  "essentialExpenses": "1444.20",
  "nonEssentialExpenses": "255.31",
  "fixedExpenses": "1245.51",
  "variableExpenses": "454.00",
  "transactionCount": 9,
  "expensesByCategory": [{ "categoryId", "categoryName", "color", "amount" }],
  "expensesByPaymentMethod": [{ "id", "name", "color", "amount" }],
  "expensesByAccount": [{ "id", "name", "color", "amount" }],
  "monthlyTrend": [{ "month": "2026-06", "total": 1699.51 }],
  "budgetProgress": [{ "id", "categoryId", "categoryName", "color", "budgeted", "spent", "percentage" }],
  "recentTransactions": [/* últimas 10 com relations */]
}
```
