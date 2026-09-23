---
title: Endpoints /forecast e /settings
area: api
updated: 2026-09-23
---

## Visão geral

Projeção de fluxo de caixa, simulador de cenário e preferências do app.
Regras de negócio em `.claude/docs/domain/forecast.md`.

Handlers usam `status()` (ver `.claude/docs/decisions/elysia-status-helper.md`).
Código: `api/src/modules/forecast/`.

## Rotas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/forecast/cashflow` | `?horizonMonths=` → projeção base |
| POST | `/forecast/simulate` | `{ horizonMonths?, events }` → `{ base, withScenario, verdict }` |
| POST | `/forecast/afford` | Atalho com um único evento, focado no veredito e nos acionáveis |
| POST | `/forecast/parse` | Frase livre → `ScenarioEvent[]` (único ponto de IA) |
| GET / PUT | `/settings` | Preferências (singleton) |

`horizonMonths` é limitado a 1–12; sem ele, usa `settings.defaultHorizonMonths`
(padrão 6).

## `GET /forecast/cashflow`

```jsonc
{
  "openingBalance": 18750.93,
  "openingAccounts": [{ "id": "uuid", "name": "Nubank", "balance": 8027.73 }],
  "months": [
    {
      "month": 9, "year": 2026, "label": "set/26",
      "expectedIncome": 0,
      "fixedExpenses": 1518,
      "variableExpensesP50": 0,
      "knownTransactions": 0,
      "scenarioImpact": 0,
      "balance": { "p10": 16969.03, "p25": 17100, "p50": 17227.07, "p75": 17240, "p90": 17248.2 },
      "probNegative": 0
    }
  ],
  "summary": {
    "endBalanceP50": -4315.38,
    "worstMonthLabel": "fev/27",
    "minBalanceP10": -5368.81,
    "probAnyNegative": 1
  },
  "assumptions": {
    "historyMonths": 4,
    "lowConfidenceCategories": ["Lazer"],
    "categoriesWithTrend": [{ "categoryName": "Alimentação", "monthlyPct": 39.7 }],
    "simulationRuns": 5000,
    "seed": 2787197211,
    "minimumReserveBrl": 1329.13,
    "minimumReserveIsDefault": true,
    "recurringIncome": {
      "monthlyTotal": 0,
      "sources": [{ "label": "Salário", "monthlyAmount": 8000, "occurrences": 5 }]
    }
  }
}
```

- `openingBalance` exclui contas `CREDIT_CARD` e lista as que entraram.
- A mesma chamada devolve sempre os mesmos números (semente fixa).
- `probNegative` e `probAnyNegative` são frações (0–1), não percentuais.
- `recurringIncome.sources` vazio significa que nenhuma entrada foi reconhecida
  como recorrente — a UI precisa avisar (ver o doc de domínio).

Cacheável por 5 min no React Query: a projeção só muda quando muda transação,
orçamento ou conta.

## `POST /forecast/simulate`

```jsonc
{
  "horizonMonths": 6,
  "events": [
    { "kind": "installment_purchase", "label": "Notebook", "totalAmount": 4000, "installments": 10 },
    { "kind": "recurring_change", "label": "Cortar streaming", "monthlyAmount": -55 }
  ]
}
```

Devolve `{ base, withScenario, verdict }` — os dois projeções completas, para a
UI desenhar as curvas sobrepostas.

### `ScenarioEvent`

```jsonc
{ "kind": "installment_purchase", "label": "...", "totalAmount": 4000,
  "installments": 10, "monthlyInterestPct": 0, "startMonth": "2026-11", "categoryId": null }

{ "kind": "recurring_change", "label": "...", "monthlyAmount": 120,
  "startMonth": "2026-11", "endMonth": null, "categoryId": null }

{ "kind": "one_off", "label": "IPVA", "amount": 1800, "month": "2027-01" }

{ "kind": "income_change", "label": "Aumento", "monthlyAmount": 800, "startMonth": "2026-12" }
```

Positivo = saída; negativo = entrada (ou corte de gasto). Meses em `YYYY-MM`.
Sem `startMonth`, o default é o **próximo** mês.

## `POST /forecast/afford`

```jsonc
// request
{ "totalAmount": 4000, "installments": 10,
  "monthlyInterestPct": 0, "label": "Notebook", "categoryId": null, "horizonMonths": 6 }
```

```jsonc
// 200
{
  "verdict": {
    "verdict": "safe | tight | risky | no",
    "probAnyNegative": 0.12,
    "minBalanceP10": 820.5,
    "minimumReserveBrl": 1329.13,
    "reason": "O saldo pode cair para R$ 820,50, abaixo da sua reserva de R$ 1.329,13."
  },
  "actions": {
    "maxAffordableTotal": 5800,
    "saferInstallments": 12,
    "bestStartMonth": "2026-12"
  },
  "base": { },
  "withScenario": { },
  "event": { }
}
```

`400` quando `totalAmount <= 0`. Um valor absurdo (R$ 500.000) devolve `no` com
`maxAffordableTotal` baixo, sem travar — a busca binária tem teto de iterações.

`reason` é montado em pt-BR de forma determinística, sem IA.

## `POST /forecast/parse`

O único ponto de IA da spec.

```jsonc
// request
{ "text": "um notebook de 4 mil em 10x sem juros" }

// 200
{
  "events": [
    { "kind": "installment_purchase", "label": "Notebook", "totalAmount": 4000,
      "installments": 10, "monthlyInterestPct": 0, "categoryId": null }
  ],
  "interpretation": "Compra de notebook de R$ 4.000 em 10x sem juros.",
  "aiAvailable": true
}
```

**A resposta nunca é aplicada direto.** Ela pré-preenche o formulário do
cenário, `interpretation` é mostrado como "entendi assim: …" e os valores ficam
editáveis. O usuário confirma. Isso elimina toda a classe de bug em que um erro
de interpretação vira um número errado na tela.

Pós-validação obrigatória: `categoryId` fora da lista vira `null`; mês em
formato inválido é descartado; `installments` fora de 1–360, valor não finito ou
`one_off` sem mês válido derrubam o evento.

Nunca responde 500: provedor fora do ar ou `LLM_ENABLED=false` devolvem
`{ events: [], interpretation: "", aiAvailable: false }`.

> O prompt carrega um exemplo completo por tipo de evento. Sem isso, o modelo
> local de 7B acerta a semântica mas erra os nomes dos campos (`type` em vez de
> `kind`, `amount` em vez de `totalAmount`) e nenhuma resposta passa no schema.

## `/settings`

Tabela singleton `app_settings` (sempre `id: 1`, criada sob demanda).

```jsonc
// GET /settings
{ "id": 1, "minimumReserveBrl": null, "defaultHorizonMonths": 6, "updatedAt": "..." }

// PUT /settings
{ "minimumReserveBrl": 2000, "defaultHorizonMonths": 6 }
```

`minimumReserveBrl: null` = usar o default calculado (mediana mensal dos gastos
essenciais). Ambos os campos são opcionais no PUT.
