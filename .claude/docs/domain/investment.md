---
title: Domínio — Investimento (Investment)
area: domain
updated: 2026-06-23
---

## Visão geral

Acompanhamento de investimentos com **aportes**, **meta** e **projeção de prazo**.
O valor atual (`currentAmount`) é atualizado **exclusivamente via aportes** — nunca por
transações, PUT ou cálculo automático de rendimento.

## Campos (tabela `investments`)

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | uuid | — | PK |
| `name` | varchar(255) | sim | Nome (ex: "PETR4", "CDB Nubank") |
| `type` | enum `investment_type` | sim | Tipo do investimento |
| `currentAmount` | numeric(10,2) | sim | Valor atual — default `0`, só muda via aporte |
| `goalAmount` | numeric(10,2) | não | Meta a atingir |
| `monthlyContribution` | numeric(10,2) | não | Aporte mensal médio esperado |
| `createdAt` / `updatedAt` | timestamp | — | `updatedAt` via `$onUpdate` |

`investment_type`: `stock` (Ações) · `cdi` (CDB/LCI/LCA) · `fii` (Fundo Imobiliário) ·
`treasury` (Tesouro Direto) · `crypto` (Cripto) · `fund` (Fundo). Foco atual: `stock` e `cdi`.

## Movimentos — aportes e retiradas (tabela `investment_contributions`)

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | uuid | — | PK |
| `investmentId` | uuid FK → investments | sim | `onDelete: cascade` |
| `type` | enum `investment_movement_type` | sim | `deposit` (aporte) \| `withdrawal` (retirada). Default `deposit` |
| `amount` | numeric(10,2) | sim | Valor do movimento, **sempre positivo**; o sinal vem do `type` |
| `date` | date | sim | Default `CURRENT_DATE` |
| `notes` | text | não | Observação |
| `createdAt` | timestamp | — | — |

### Regra crítica — atualização de valor

> `currentAmount` só muda via movimentos (aporte/retirada) — nunca por PUT, transações ou
> cálculo de rendimento. Aporte e retirada são **ações separadas na UI** (botões distintos),
> mas compartilham a mesma tabela com a coluna `type`.

- **Aporte** (`POST .../contributions` com `type: "deposit"`): `currentAmount += amount`.
- **Retirada** (`POST .../contributions` com `type: "withdrawal"`):
  `currentAmount = GREATEST(0, currentAmount - amount)`.
- **Remover movimento** (`DELETE .../contributions/:id`): reverte conforme o `type` —
  aporte removido subtrai; retirada removida soma (sem ficar negativo).

## Projeção de prazo

Calculada **em tempo de leitura** (`api/src/lib/investment.ts`, `computeProjection`), nunca
armazenada. Trabalha **somente sobre valor bruto** (sem rendimentos/juros).

```
remainingAmount = max(0, goalAmount - currentAmount)
estimatedMonths = CEIL(remainingAmount / monthlyContribution)
```

| Situação | Resultado |
|----------|-----------|
| `goalAmount` ou `monthlyContribution` nulos | `projection: null` |
| `currentAmount >= goalAmount` | `goalReached: true`, label "Meta atingida ✅" |
| `monthlyContribution = 0` | `estimatedMonths: null`, label "Aporte mensal não definido" |
| válido | `estimatedMonths` + label ("1 ano e 2 meses", "1 ano", "3 meses") |

A mesma lógica é espelhada no frontend (`app/src/lib/investment.ts`) para projeção em tempo
real no formulário.
