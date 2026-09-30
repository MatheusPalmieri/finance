---
title: API — Transações, Contas e Dashboard
area: api
updated: 2026-09-30
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
`from`, `to`, `order` (`asc`|`desc`, padrão `desc`; ordena por data dentro do período). Resposta: `{ data, total, page, limit }`. Sempre com `REAL_TRANSACTIONS`
(`source = 'open_finance'`).

**Body do PATCH:**
```json
{
  "name": "Supermercado",
  "categoryId": "uuid",
  "notes": null
}
```
- `amount`, `date`, `accountId` e `paymentMethod` no corpo são descartados pela
  validação — são do banco.
- Não há vínculo com orçamento nem campo essencial/recorrência: a categoria
  decide o orçamento e o grupo 50/30/20 (ver `domain/budget.md`).
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
usa `REAL_TRANSACTIONS`, só com data até hoje (parcela futura do cartão não é
"recente"), e mostra despesas e entradas. Query params `month`,
`year` (default: mês atual).

- **Sem classificação**: transação na categoria de reserva do sync (`Outros`,
  `lib/fallback-category.ts`) — `category_id` é obrigatório, então não há `null`.
  `expensesByGroup` **não** a inclui: contá-la no grupo de "Outros" seria
  inventar dado. Limitação: quem reclassifica de propósito para "Outros" cai no
  mesmo balde.
- **`expensesByGroup`**: despesas pelo grupo 50/30/20 da categoria
  (`categories.group`). Por ser painel de despesas, não inclui o líquido de
  aplicações, que a tela de Orçamentos soma no grupo investimento.
- **`pace`**: total de despesas do mês anterior até o mesmo dia (`cutoffDay`).
  `partial` = o mês pedido é o corrente; mês fechado compara com o anterior inteiro.

Resposta:

```jsonc
{
  "totalExpenses": "1699.51",
  "expensesByGroup": { "essential": "1444.20", "variable": "255.31", "investment": "0" },
  "unclassifiedExpenses": "0.00",
  "unclassifiedCount": 0,
  "pace": { "previousTotal": "1570.00", "cutoffDay": 23, "partial": true },
  "transactionCount": 9,
  "expensesByCategory": [{ "categoryId", "categoryName", "color", "amount" }],
  "expensesByPaymentMethod": [{ "id", "name", "color", "amount" }],
  "expensesByAccount": [{ "id", "name", "color", "amount" }],
  "monthlyTrend": [{ "month": "2026-06", "total": 1699.51 }],
  "recentTransactions": [/* últimas 6 até hoje, com relations */]
}
```
