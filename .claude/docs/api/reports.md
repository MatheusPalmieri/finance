---
title: Endpoints /reports
area: api
updated: 2026-09-23
---

## Visão geral

Check-up mensal: métricas, insights e narrativa. Regras de negócio em
`.claude/docs/domain/monthly-report.md`.

Handlers usam `status()` (ver `.claude/docs/decisions/elysia-status-helper.md`).
Código: `api/src/modules/reports/`.

## Rotas

| Método | Rota | Descrição |
|---|---|---|
| POST | `/reports/monthly/generate` | Gera (ou regenera) e devolve o relatório |
| GET | `/reports/monthly` | Lista resumida, mais recente primeiro |
| GET | `/reports/monthly/current` | Atalho: o relatório do mês anterior ao atual, gerando na hora se não existir |
| GET | `/reports/monthly/:id` | Relatório completo |
| POST | `/reports/monthly/:id/narrate` | Só (re)gera a narrativa de um relatório existente |
| DELETE | `/reports/monthly/:id` | Apaga |

> `/monthly/current` é declarada **antes** de `/monthly/:id` para não ser
> capturada como um id.

## `POST /reports/monthly/generate`

```jsonc
{
  "month": 8,
  "year": 2026,
  "narrate": true            // default true
}
```

Devolve o relatório completo (ver estrutura abaixo).

- Regerar o mesmo período **sobrescreve** a linha; não duplica.
- Gerar um mês **ainda em curso** é permitido: a resposta traz
  `metrics.period.partial: true` e a UI rotula "mês em andamento".
- A geração é síncrona — as queries são de um mês de dados e a narrativa é uma
  chamada. O schema já comporta mover só a narrativa para background
  (`GENERATED` → `NARRATED` via polling) se num modelo local ela passar de ~30s.

## Estrutura da resposta

```jsonc
{
  "id": "uuid",
  "month": 8,
  "year": 2026,
  "status": "GENERATED | NARRATED | NARRATION_FAILED",
  "generatedAt": "2026-09-19T21:00:00.000Z",
  "narrative": "string | null",
  "suggestions": [
    { "title": "...", "rationale": "...", "estimatedSavingBrl": null, "insightKind": "rule_503020_off" }
  ],
  "narrativeProvider": "ollama | anthropic | null",
  "narrativeModel": "qwen2.5:7b-instruct | null",
  "aiAvailable": false,
  "metrics": {
    "period": { "month", "year", "from", "to", "partial" },
    "totals": {
      "totalExpenses": { "current": 795.9, "previous": 575.9, "deltaPct": 38.2 },
      "totalIncome": { }, "netResult": { }, "savingsRate": { },
      "transactionCount": { }, "avgTicket": { }, "noSpendDays": { }
    },
    "biggestExpense": { "id", "name", "amountBrl", "date", "categoryName" },
    "budgets": [
      { "budgetId", "name", "type", "amountType", "plannedBrl", "plannedMinBrl",
        "plannedMaxBrl", "actualBrl", "status": "over|under|on_track|missing",
        "transactionCount" }
    ],
    "distribution": {
      "essential": { "amountBrl", "pct", "targetPct": 50, "deltaPp" },
      "desire": { }, "investment": { }
    },
    "anomalies": [
      { "categoryId", "categoryName", "color", "currentBrl", "medianBrl",
        "robustZ", "severity": "high|medium|saving",
        "history": [{ "month": "2026-02", "amountBrl": 900 }],
        "topTransactions": [{ "id", "name", "amountBrl", "date" }] }
    ],
    "topMovers": { "up": [], "down": [] },
    "newMerchants": [{ "merchantKey", "label", "totalBrl", "transactionCount" }],
    "subscriptions": null
  },
  "insights": [
    { "kind", "severity", "title", "amountBrl", "categoryId?", "budgetId?",
      "recurringSeriesId?", "facts": { } }
  ]
}
```

`deltaPct` é `null` quando o mês anterior é zero. `savingsRate.current` é `null`
quando não há receita. `subscriptions` é `null` quando não há séries recorrentes
detectadas.

## `GET /reports/monthly`

Lista resumida — não carrega o `jsonb` inteiro:

```jsonc
[
  { "id", "month", "year", "status", "generatedAt",
    "totalExpenses": 795.9, "netResult": 7204.1, "criticalInsights": 0 }
]
```

`totalExpenses`, `netResult` e `criticalInsights` são extraídos do `jsonb` na
própria query.

## `POST /reports/monthly/:id/narrate`

Usado pelo botão "Gerar texto" quando a IA estava fora.

| Resposta | Quando |
|---|---|
| `200` relatório | Narrativa gerada (`NARRATED`) ou rejeitada pela validação (`NARRATION_FAILED`) |
| `404` | Relatório não encontrado |
| `503 { message }` | IA indisponível — nada é alterado |

## Degradação sem IA

Com `LLM_ENABLED=false` ou provedor fora do ar, todas as rotas respondem
normalmente; o relatório vem completo com `aiAvailable: false` e sem narrativa.
Nenhum número da resposta depende do LLM.

## Automação

```bash
bun run api/scripts/monthly-report.ts            # mês anterior, todos os escopos
bun run api/scripts/monthly-report.ts 2026-08    # mês específico
# ou, de dentro de api/:
bun run report:monthly 2026-08
```

Chama o mesmo `service.generate()` da rota — a lógica nunca é duplicada no
script — e é idempotente. Agendamento em `.claude/docs/infra/scheduler.md`.
