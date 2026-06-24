---
title: API — Transações, Contas (padrão) e Dashboard
area: api
updated: 2026-06-23
---

## Transações — `api/src/routes/transactions.ts` (prefixo `/transactions`)

Toda transação é uma despesa. Ver regras de domínio em `.claude/docs/domain/transaction.md`.

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/transactions` | Lista paginada com filtros, traz `account`, `category`, `paymentMethod` |
| GET | `/transactions/:id` | Busca por ID (com relations) |
| POST | `/transactions` | Cria e subtrai o valor do saldo da conta |
| PUT | `/transactions/:id` | Atualiza; reverte saldo antigo e aplica o novo |
| DELETE | `/transactions/:id` | Remove e devolve o valor ao saldo da conta |

**Query params de GET `/transactions`:** `page`, `limit` (máx 100), `search` (ilike em `name`), `categoryId`, `paymentMethodId`, `accountId`, `recurrence` (`fixed`\|`variable`), `isEssential` (`true`\|`false`), `from`, `to` (datas). Resposta: `{ data, total, page, limit }`.

**Body (POST / PUT):**
```json
{
  "name": "Supermercado",
  "amount": 150.50,
  "categoryId": "uuid",
  "paymentMethodId": "uuid",
  "accountId": "uuid",
  "isEssential": true,
  "recurrence": "variable",
  "budgetId": null,
  "date": "2026-06-23",
  "notes": null
}
```
Validações: `name` minLength 1; `amount` ≥ 0.01; `categoryId`/`paymentMethodId`/`accountId` strings obrigatórias; `isEssential` boolean; `recurrence` ∈ {`fixed`,`variable`}; `date` string; `notes` opcional/nullable.

**`budgetId`** (FK → budgets, nullable): obrigatório quando `recurrence = fixed` (400 se ausente); forçado a `null` quando `recurrence = variable`. As respostas trazem a relation `budget`. Ver `.claude/docs/api/budgets.md`.

## Contas — `api/src/routes/accounts.ts` (prefixo `/accounts`)

Além do CRUD, ganhou suporte a conta padrão:

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/accounts/default` | Retorna a conta com `isDefault = true` (ou `null`) |

- `POST` e `PUT` aceitam `isDefault?: boolean`. Ao definir `true`, as demais contas são desmarcadas (apenas uma padrão por vez).
- A rota estática `/accounts/default` é declarada **antes** de `/accounts/:id` para não colidir.

## Dashboard — `api/src/routes/dashboard.ts` (`GET /dashboard/summary`)

Painel de despesas. Query params `month`, `year` (default: mês atual). Resposta:

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

Cortes essencial/recorrência usam `SUM(...) FILTER (WHERE ...)` do PostgreSQL. `budgetProgress` soma as transações da categoria no mês (todas são despesas — sem filtro por tipo).
