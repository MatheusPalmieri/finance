---
title: Domínio — Orçamento (Budget)
area: domain
updated: 2026-09-25
---

## Visão geral

O orçamento é um **catálogo de gastos planejados nomeados** (ex: "Aluguel", "Internet"), classificados pela regra **50/30/20**. Substituiu por completo o modelo antigo (limite mensal por categoria com `categoryId`/`month`/`year`).

## Campos (tabela `budgets`)

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | uuid | — | PK |
| `name` | varchar(255) | sim | Nome do orçamento |
| `type` | enum `budget_type` | sim | `essential` (50%) \| `desire` (30%) \| `investment` (20%) |
| `amountType` | enum `budget_amount_type` | sim | `fixed` \| `variable` |
| `amount` | numeric(10,2) | condicional | Valor fixo — obrigatório se `amountType = fixed` |
| `amountMin` | numeric(10,2) | condicional | Mínimo — obrigatório se `amountType = variable` |
| `amountMax` | numeric(10,2) | condicional | Máximo — obrigatório se `amountType = variable` |

`budget_type` é um enum fixo no sistema (sem CRUD próprio).

**Nomenclatura (2026-09-25):** na interface e nos textos gerados (insights do
check-up) o grupo `desire` se chama **"Variável"** — o termo "Desejo" saiu da
aplicação. O valor do enum no banco/API continua `desire` para não exigir
migração nem colidir com `recurrence = "variable"` no código. Rótulos em
`BUDGET_TYPE_LABELS` (`app/src/types/finance.ts`) e `TYPE_LABELS`
(`api/src/modules/reports/insights.ts`).

Para "Variável" não ter três sentidos, na mesma data:
- `amountType` aparece como **"Valor fixo" / "Faixa"** (antes "Valor variável").
- `transactions.recurrence` aparece como **"Recorrente" / "Avulso"** (antes
  "Fixo" / "Variável") em Transações, Regras, Início ("Recorrentes") e Projeção
  ("Gastos recorrentes" / "Avulsos (provável)"). Os valores no banco seguem
  `fixed`/`variable`; o classificador por IA aceita "avulso"/"avulsa" como
  `variable`.

## Regras de validação

Aplicadas na rota (`api/src/routes/budgets.ts`, `validateAmounts`):
- `amountType = fixed` → `amount` obrigatório; `amountMin`/`amountMax` ficam nulos.
- `amountType = variable` → `amountMin` e `amountMax` obrigatórios; `amount` fica nulo.
- `amountMin` deve ser **menor que** `amountMax`.

A normalização (`normalizeAmounts`) zera os campos que não se aplicam ao tipo escolhido.

## Integração com Transações

A coluna `transactions.budget_id` (FK nullable → budgets) vincula um gasto fixo ao seu orçamento:
- `recurrence = fixed` → `budgetId` **obrigatório** (400 se ausente).
- `recurrence = variable` → `budgetId` forçado a **nulo**.

Validado em `resolveBudgetId` (`api/src/routes/transactions.ts`). No frontend, o campo só aparece quando a transação é fixa e usa um **combobox com busca** (`BudgetCombobox`) que consulta `GET /budgets?name=...`.

## Realizado do mês (tela de Orçamentos, 2026-09-25)

A tela compara o plano com o que aconteceu no mês (`GET /budgets/summary`).
Regra de cada grupo — **essencial/não essencial não pesa aqui** (o check-up
continua usando `classifySpend`):

| Grupo na tela | Enum | O que entra |
|---|---|---|
| **Fixo** | `essential` | Transações vinculadas a orçamentos desse grupo (o usuário vincula as recorrentes) |
| **Variável** | `desire` | Vinculadas a orçamentos desse grupo + **toda saída `regular` sem vínculo** |
| **Investimento** | `investment` | Vinculadas a esse grupo + `kind = investment` sem vínculo, pelo **líquido** (aplicações − resgates) |

Fatura (`bill_payment`) e transferência entre contas próprias ficam fora. A
**base da %** é a renda do mês: entradas `regular` (amount < 0). Proventos
("Valor recebido de Investimentos") entram como renda, não como resgate.

Faixas (mín–máx) entram nos totais pelo modo escolhido na tela: mínimo, médio
(padrão) ou máximo. O uso de cada item é medido contra o teto (valor exato ou
máximo da faixa).

Nomes só da tela de Orçamentos (e do `BudgetModal`): `essential` aparece como
**"Fixo"** (`BUDGET_GROUP_LABELS`); no resto do app segue "Essencial". A forma
do valor aparece como **"Valor exato" / "Faixa"**.

## Impacto da migração

- O widget de "Orçamento" do Dashboard/Home (gasto vs orçado por categoria) foi **removido** — o novo modelo não tem escopo mensal por categoria. `dashboard/summary` não retorna mais `budgetProgress`.
- A página de Orçamentos virou um CRUD agrupado por tipo (50/30/20) com busca por nome. Em 2026-09-25 foi redesenhada (ver `frontend/budgets.md`).
