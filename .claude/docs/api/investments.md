---
title: API — Investimentos (Investments)
area: api
updated: 2026-06-23
---

## Investimentos — `api/src/routes/investments.ts` (prefixo `/investments`)

Regras de domínio em `.claude/docs/domain/investment.md`. Respostas em **camelCase**
(convenção do projeto via Drizzle). Todo investimento retorna o objeto `projection` calculado.

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/investments` | Lista todos (com `projection`), ordenado por nome |
| GET | `/investments?name=cdb` | Filtra por nome (`ilike`) |
| GET | `/investments/:id` | Busca por ID (com `projection`) |
| POST | `/investments` | Cria (`currentAmount` inicia em `0`) |
| PUT | `/investments/:id` | Atualiza `name`, `type`, `goalAmount`, `monthlyContribution` |
| DELETE | `/investments/:id` | Remove (movimentos em cascata) |

> ⚠️ `PUT` **não altera** `currentAmount` — atualização de valor é exclusiva dos aportes.

**Body (POST / PUT):**
```jsonc
{ "name": "CDB Nubank", "type": "cdi", "goalAmount": 10000, "monthlyContribution": 500 }
// goalAmount e monthlyContribution são opcionais (nullable)
```

**Resposta (`GET /investments/:id`):**
```jsonc
{
  "id": "uuid",
  "name": "CDB Nubank",
  "type": "cdi",
  "currentAmount": "1500.00",
  "goalAmount": "10000.00",
  "monthlyContribution": "500.00",
  "projection": {
    "remainingAmount": 8500,
    "estimatedMonths": 17,
    "estimatedLabel": "1 ano e 5 meses",
    "goalReached": false
  },
  "updatedAt": "2026-06-23T00:00:00.000Z"
}
```
`projection` é `null` quando `goalAmount` ou `monthlyContribution` forem nulos.

## Movimentos — aportes e retiradas (prefixo `/investments/:id/contributions`)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/investments/:id/contributions` | Histórico (ordenado por data desc) |
| POST | `/investments/:id/contributions` | Registra aporte/retirada e atualiza `currentAmount` |
| DELETE | `/investments/:id/contributions/:contributionId` | Remove e reverte `currentAmount` |

**Body (POST):**
```jsonc
{ "type": "deposit", "amount": 500, "date": "2026-06-23", "notes": "Aporte de junho" }
{ "type": "withdrawal", "amount": 200, "notes": "Resgate parcial" }
// type opcional (default "deposit"); amount sempre positivo; date e notes opcionais
```

Lógica (ver domínio):
- **POST `deposit`** → `currentAmount = currentAmount + amount`.
- **POST `withdrawal`** → `currentAmount = GREATEST(0, currentAmount - amount)`.
- **DELETE** → reverte conforme o `type` do movimento (aporte subtrai, retirada soma).

Erros retornam **404** `{ message }` quando o investimento/aporte não existe. Usa o helper
`status(code, body)` (ver `.claude/docs/decisions/elysia-status-helper.md`).
