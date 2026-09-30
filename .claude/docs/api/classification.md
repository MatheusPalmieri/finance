---
title: Endpoints /classification e /recurring
area: api
updated: 2026-09-30
---

## Visão geral

Motor de classificação de descrições de extrato e séries recorrentes.
Regras de negócio em `.claude/docs/domain/classification.md`.

Todos os handlers usam `status()`, nunca `error()`
(ver `.claude/docs/decisions/elysia-status-helper.md`).

Código: `api/src/modules/classification/`.

## `POST /classification/suggest`

Coração do motor. Recebe descrições cruas, devolve sugestões com a origem.

```jsonc
// request
{
  "useAi": true,               // false pula a camada 3
  "items": [
    { "index": 0, "description": "PAG*Netflix" }
  ]
}
```

```jsonc
// 200
{
  "aiAvailable": true,
  "items": [
    {
      "index": 0,
      "source": "rule | knn | llm | none",
      "ruleId": "uuid | null",
      "confidence": 0.86,
      "suggestedName": "Netflix",
      "categoryId": "uuid | null",
      "paymentMethod": "credit_card | null"
    }
  ],
  "stats": { "rule": 12, "knn": 5, "llm": 3, "none": 1, "llmLatencyMs": 1840 }
}
```

- Só a descrição entra: valor e data nunca chegam à rota nem ao LLM. Campos a
  mais no corpo são descartados pela validação.
- A sugestão cobre nome, categoria e forma de pagamento. O grupo 50/30/20 e o
  orçamento vêm da categoria (ver `domain/budget.md`).
- A rota **nunca falha por causa da IA**: se a camada 3 cair, as linhas
  residuais voltam com `source: "none"` e `aiAvailable: false`.
- `confidence`: `1` para regra, a similaridade no kNN, teto de `0,9` no LLM.

## `POST /classification/feedback`

Transforma uma correção em regra `learned`.

> **A confirmar:** nenhuma tela chama esta rota hoje (o hook do front saiu em
> 2026-09-30 junto com a antiga revisão de importação). Ligar "aplicar sempre"
> na reclassificação é o próximo passo natural.

```jsonc
{
  "description": "PAG*Netflix 12/24",   // a descrição CRUA, não o nome editado
  "categoryId": "uuid",
  "paymentMethod": "credit_card",
  "renameTo": "Netflix",
  "createRule": true                    // false só registra, não cria regra
}
```

| Resposta | Quando |
|---|---|
| `200 { ruleId, created: boolean }` | Criou ou atualizou uma regra `learned` |
| `409 { conflictRuleId, message }` | Já existe regra `seed`/`manual` com esse pattern |
| `400 { message }` | Descrição sem texto aproveitável para virar pattern |

O pattern é derivado de `merchantKey(description)`.

## CRUD de regras

| Método | Rota | Descrição |
|---|---|---|
| GET | `/classification/rules` | Query: `search`, `source`, `enabled`. Ordenada por `priority desc, hitCount desc`; traz `category` |
| POST | `/classification/rules` | Cria. `400` com regex inválida quando `matchType: "regex"` |
| PUT | `/classification/rules/:id` | Edita |
| PATCH | `/classification/rules/:id/toggle` | Liga/desliga sem apagar |
| DELETE | `/classification/rules/:id` | Remove de vez |
| POST | `/classification/rules/test` | `{ pattern, matchType }` → até 20 transações que casariam. Preview antes de salvar |
| GET | `/classification/rules/:id/apply` | Prévia de "aplicar às existentes": o que a regra mudaria no histórico |
| POST | `/classification/rules/:id/apply` | Aplica a regra nas transações que já estão no banco |

Corpo de criação/edição (todos os campos além de `pattern` são opcionais):

```jsonc
{
  "pattern": "conceito imobiliaria",
  "matchType": "contains | exact | regex",
  "source": "seed | manual | learned",
  "priority": 500,
  "renameTo": "Aluguel",
  "categoryId": "uuid | null",
  "paymentMethod": "boleto | null",
  "enabled": true
}
```

Toda escrita invalida o cache em memória das regras.

### `POST /classification/rules/test`

```jsonc
// 200
{ "matches": [{ "id": "uuid", "name": "...", "amount": "1800.00", "date": "2025-11-05" }], "total": 3 }
```

Varre as 500 transações mais recentes (só `REAL_TRANSACTIONS`) e devolve no
máximo 20 casos. Casa pelo **nome do banco** (`originalName`), como o sync — o
nome que o usuário editou não conta.

### `GET` / `POST /classification/rules/:id/apply`

Regras só valem para transação nova do sync. Estas rotas reaplicam uma regra no
histórico, a pedido do usuário.

```jsonc
// GET 200 — só as que mudariam, no máximo 50 na lista
{
  "total": 6,
  "data": [
    {
      "id": "uuid", "date": "2026-08-31", "amount": "480.00",
      "originalName": "Yduqs 5/6", "name": "Faculdade", "nextName": "Faculdade",
      "fields": ["name", "category"]   // name | category
    }
  ]
}
// POST 200
{ "applied": 6 }
```

- Considera **só esta regra**, independente da prioridade, e casa pelo
  `originalName`. Regra desligada também pode ser aplicada.
- Só nome (`renameTo`) e categoria (`categoryId`). `paymentMethod` **não** é
  aplicado: a forma de pagamento é do Open Finance. Mudar a categoria já move o
  gasto de orçamento e de grupo.
- O `POST` recalcula o plano na hora (não confia na prévia), grava tudo numa
  transação e dispara `scheduleRecalculate()`. É idempotente: aplicar de novo
  devolve `applied: 0`.
- `404` se a regra não existe.

## Séries recorrentes

| Método | Rota | Descrição |
|---|---|---|
| GET | `/recurring` | Query: `status`, `includeDismissed` |
| POST | `/recurring/recalculate` | Sem body → `{ detected, updated, removed }` |
| PATCH | `/recurring/:id/dismiss` | Marca `dismissed: true` |
| GET | `/recurring/:id/transactions` | As transações que compõem a série |

```jsonc
// GET /recurring
{
  "data": [
    {
      "id": "uuid",
      "merchantKey": "netflix",
      "label": "Netflix",
      "intervalDays": 30,
      "occurrences": 3,
      "averageAmount": "55.90",
      "firstAmount": "55.90",
      "lastAmount": "55.90",
      "firstChargeDate": "2026-06-05",
      "lastChargeDate": "2026-08-05",
      "expectedNextDate": "2026-09-04",
      "status": "ACTIVE | OVERDUE | CANCELLED",
      "dismissed": false,
      "category": { },
      "monthlyCostBrl": 55.9,
      "priceChangePct": null,
      "priceChangeSince": null
    }
  ],
  "totalMonthly": 55.9
}
```

`totalMonthly` soma apenas as séries `ACTIVE`. `monthlyCostBrl`,
`priceChangePct` e `priceChangeSince` são derivados na consulta, não
persistidos.
