---
title: Check-up mensal (relatório e anomalias)
area: domain
updated: 2026-09-19
---

## Visão geral

No fechamento de cada mês o app gera um relatório de consultoria: aderência à
regra 50/30/20, anomalias por categoria com significância estatística, o que
mais subiu e caiu, estabelecimentos novos, assinaturas e — quando há IA — um
texto curto em pt-BR explicando tudo.

Implementa `.claude/docs/specs/02-monthly-checkup.md`.

## Princípio de projeto

> **Todo número do relatório é calculado em SQL/TypeScript e persistido antes de
> o LLM ser chamado.** O LLM recebe o JSON pronto e escreve prosa. Se a
> narrativa citar um número que não está no JSON, é bug — e a validação
> anti-alucinação descarta o texto.

É o que permite usar um modelo 7B local sem risco e o que garante que o
relatório continua correto e útil com a IA desligada.

## Escopo

Mês + carteira (`walletId` opcional; `null` = transações sem carteira).
Convenção de sinal do projeto: `amount > 0` é despesa, `amount < 0` é entrada
(ver [`transaction.md`](./transaction.md)).

## Seções das métricas

### 1. Totais

`totalExpenses`, `totalIncome`, `netResult`, `savingsRate`, `transactionCount`,
`avgTicket`, `noSpendDays`. Cada um vem como
`{ current, previous, deltaPct }` — `deltaPct` é `null` quando o mês anterior é
zero, para não virar "+∞%". Mais `biggestExpense` (a maior despesa isolada, com
nome, data e categoria).

### 2. Aderência 50/30/20

Duas leituras, ambas úteis:

**a) Planejado vs. realizado** — para cada `budget`, soma as transações do mês
com aquele `budgetId`:

| `amountType` | `over` | `under` | `on_track` |
|---|---|---|---|
| `fixed` | `> amount * 1,02` | `< amount * 0,98` | entre os dois |
| `variable` | `> amountMax` | `< amountMin` | entre os dois |

Orçamento **sem nenhum lançamento no mês** entra com status `missing` — é assim
que o relatório pega "esqueceu de lançar a conta de luz".

> Orçamentos são globais e transações são escopadas por carteira. Num relatório
> de carteira específica, orçamentos alimentados por outra carteira aparecem
> como `missing`. É consequência do modelo, não bug.

**b) Distribuição do gasto total** — gasto variável não tem `budgetId`, então a
classificação é por outra regra, determinística:

- `recurrence = "fixed"` → herda o `type` do orçamento vinculado;
- `recurrence = "variable"` + `isEssential` → `essential`;
- `recurrence = "variable"` sem `isEssential` → `desire`;
- `investment` só vem de orçamento vinculado.

Resultado por bucket: `{ amountBrl, pct, targetPct, deltaPp }`.

### 3. Anomalias por categoria

1. Série dos **6 meses anteriores** ao do relatório (o mês corrente fica de fora
   de propósito — ele é o valor testado).
2. Exige ≥ 3 meses com gasto (`MIN_HISTORY_POINTS`).
3. Usa **mediana e MAD**, não média e desvio-padrão: com 6 pontos, um mês
   atípico contamina a média e o alerta nunca dispara.
   `robustZ = 0,6745 * (atual − mediana) / MAD`.
4. `MAD = 0` (valor idêntico todo mês, ex.: aluguel) → cai numa variação
   percentual simples com limiar de 10% (10% ≡ `z = 2`).

| `robustZ` | Severidade |
|---|---|
| `≥ 3,5` | `high` |
| `≥ 2,0` | `medium` |
| `≤ −2,0` | `saving` (gastou bem menos — também é notícia) |
| resto | não entra |

Cada anomalia carrega a série dos 6 meses (sparkline) e **as 3 maiores
transações** — sem isso o usuário lê "Alimentação subiu 48%" e não sabe por quê.

### 4. Top movers

As 5 categorias que mais subiram e as 5 que mais caíram em **valor absoluto**
contra o mês anterior — 300% de uma categoria de R$ 20 não é notícia.
Categorias que sumiram entram com `current = 0`.

### 5. Estabelecimentos novos

`merchantKey` (de [`classification.md`](./classification.md)) que aparece no mês
e não nos 6 anteriores, com gasto ≥ R$ 50. Os 5 maiores.

### 6. Assinaturas

Da tabela `recurring_series`: total mensal normalizado, séries novas no mês,
séries com aumento de preço e as `OVERDUE`/`CANCELLED`. É `null` quando não há
séries detectadas — a seção simplesmente não aparece.

### 7. Insights tipados

Produzidos **antes** do LLM, é o que a UI renderiza como cards e o que a
narrativa recebe como material.

| `kind` | Severidade | Dispara quando |
|---|---|---|
| `negative_month` | `critical` | `netResult < 0` |
| `budget_over` | `warn` | Orçamento estourou |
| `budget_missing` | `warn` | Orçamento sem lançamento no mês |
| `category_spike` | `critical`/`warn` | Anomalia `high`/`medium` |
| `category_saving` | `info` | Anomalia `saving` |
| `rule_503020_off` | `info` | Desvio > 5 pp da meta |
| `subscription_new` | `info` | Série recorrente nova no mês |
| `subscription_price_up` | `warn` | Série com aumento de preço |
| `record_month` | `info` | Gasto total variou ≥ 20% |

Ordenados por severidade e depois por `amountBrl` desc; o relatório guarda no
máximo 12. Um `title` em pt-BR já pronto **sem IA**, e `facts` com os dados
crus que a narrativa pode citar.

**Mês sem nenhum movimento devolve lista vazia** — sem despesa não há orçamento
"esquecido", e uma distribuição 50/30/20 de zero não diz nada. A UI mostra o
estado vazio.

## Tabela `monthly_reports`

Unique em `(month, year, walletId)`. Regerar **sobrescreve** a linha: o
relatório é derivado, não há histórico de versões.

`metrics` e `insights` são `jsonb` porque o relatório é um snapshot imutável do
mês — não se consulta por dentro dele.

| `status` | Significado |
|---|---|
| `GENERATED` | Números prontos, sem narrativa |
| `NARRATED` | Com texto da IA |
| `NARRATION_FAILED` | Números prontos, IA falhou ou o texto foi rejeitado |

## Narrativa e validação anti-alucinação

`temperature: 0,4` — prosa natural, não criativa. O prompt manda usar
exclusivamente os valores do JSON.

Depois do zod, o texto é varrido por regex de valores (`R$ …` e `…%`) e cada
número é conferido contra o conjunto de números presentes em
`metrics`/`insights`, com tolerância de arredondamento de ±1%. Se algum não for
encontrado, **a narrativa é descartada** e o relatório fica `NARRATION_FAILED`.
Melhor sem texto do que com texto errado. O caso é logado para ajuste de prompt.

A comparação é feita em módulo: o motor guarda `320` e a narrativa pode
legitimamente escrever "R$ 320,00 negativos".

## Degradação sem IA

| Situação | Comportamento |
|---|---|
| `LLM_ENABLED=false` | `POST /generate` responde 200, relatório completo, `aiAvailable: false`, sem narrativa |
| Provedor fora do ar | Idem, `status: GENERATED` |
| Narrativa rejeitada | `status: NARRATION_FAILED`, números intactos, botão "Gerar texto" na UI |

Nenhum número exibido na UI vem do campo `narrative`.

## Onde olhar

| Assunto | Arquivo |
|---|---|
| Contrato HTTP | `.claude/docs/api/reports.md` |
| Tela | `.claude/docs/frontend/reports.md` |
| Agendamento | `.claude/docs/infra/scheduler.md` |
| Camada de IA | `.claude/docs/api/llm.md` |
| Código | `api/src/modules/reports/` |
