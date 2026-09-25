---
title: API — Orçamentos (Budgets)
area: api
updated: 2026-09-25
---

## Orçamentos — `api/src/routes/budgets.ts` (prefixo `/budgets`)

Catálogo de gastos planejados (50/30/20). Regras de domínio em `.claude/docs/domain/budget.md`.

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/budgets` | Lista todos, ordenado por nome |
| GET | `/budgets?name=alug` | Filtra por nome (`ilike`) — usado pelo autocomplete na transação |
| GET | `/budgets/summary?month=9&year=2026` | Realizado do mês para a tela de Orçamentos (sem params = mês atual) |
| GET | `/budgets/:id` | Busca por ID |
| POST | `/budgets` | Cria (valida regras de valor) |
| PUT | `/budgets/:id` | Atualiza (valida regras de valor) |
| DELETE | `/budgets/:id` | Remove |

**Body (POST / PUT):**
```jsonc
// fixo
{ "name": "Aluguel", "type": "essential", "amountType": "fixed", "amount": 2200 }
// variável
{ "name": "Conta de Luz", "type": "essential", "amountType": "variable", "amountMin": 90, "amountMax": 260 }
```

Validações (retornam **400** com `{ message }`):
- `fixed` → `amount` obrigatório.
- `variable` → `amountMin` e `amountMax` obrigatórios e `amountMin < amountMax`.

Os campos que não se aplicam ao `amountType` são gravados como `null`.

## Integração na rota de Transações

`POST` / `PUT /transactions` agora aceitam `budgetId` (nullable). Validação:
- `recurrence = fixed` e sem `budgetId` → **400** `"Selecione o orçamento vinculado ao gasto recorrente"`.
- `recurrence = variable` → `budgetId` é forçado a `null`, mesmo se enviado.

`GET /transactions` e `GET /transactions/:id` passam a trazer a relation `budget`.

## Nota técnica — `status` vs `error`

Nesta versão do Elysia o helper de resposta no contexto é **`status(code, body)`** (e não `error`, que é `undefined` em runtime — causava `error is not a function`). Todas as rotas foram ajustadas para `status`. Ver `.claude/docs/decisions/elysia-status-helper.md`.

## `GET /budgets/summary`

Realizado do mês que a tela de Orçamentos compara com o plano. Só leitura,
tudo do Open Finance (`REAL_TRANSACTIONS`). Regra em `domain/budget.md`.

```jsonc
{
  "month": 9, "year": 2026,
  "income": 9042.95,              // entradas `regular` do mês (base da %)
  "spentByType": { "essential": 3232.01, "desire": 7265.86, "investment": 0 },
  "investmentFlow": { "invested": 0, "redeemed": 0 }, // sem vínculo; investment = invested − redeemed
  "spentByBudget": { "<budgetId>": 2250 }             // soma líquida das vinculadas
}
```

Teste: `api/src/e2e/budgets-summary.e2e.test.ts`.
