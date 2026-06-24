---
title: Frontend — Investimentos
area: frontend
updated: 2026-06-23
---

## Página — `app/src/pages/Investments/index.tsx` (rota `/investments`)

CRUD de investimentos em **tabela**, com aportes e projeção de prazo. Item na Sidebar com
ícone `TrendingUp`; rota lazy em `App.tsx`.

### Listagem (tabela)

Colunas: **Nome · Tipo · Valor atual · Meta · Progresso · Previsão · Ações**.
- **Progresso**: barra `(currentAmount / goalAmount) * 100` (clampada em 100%) + percentual.
- **Previsão**: `projection.estimatedLabel` ("~1 ano e 5 meses", "Meta atingida ✅" ou
  "Aporte mensal não definido"); "—" quando `projection` é `null`.
- **Ações**: botões "Aporte" (verde) e "Retirada" (vermelho) + ícones Histórico / Editar / Excluir.

### Modais

| Modal | Função |
|-------|--------|
| `InvestmentModal` | Criar/editar (`name`, `type`, `goalAmount?`, `monthlyContribution?`) com **projeção em tempo real** |
| `ContributionModal` | Registrar movimento — parametrizado por `type` (`deposit`/`withdrawal`); labels e textos mudam conforme o tipo |
| `HistoryModal` | Histórico de movimentos (aporte +verde / retirada −vermelho) com remoção individual |
| `AlertDialog` | Confirmação de exclusão do investimento |

Aporte e retirada são **botões separados** que abrem o mesmo `ContributionModal` com `type`
fixado, mantendo as ações distintas para o usuário.

A projeção em tempo real no formulário usa `computeProjection` de `app/src/lib/investment.ts`
(espelha a lib do backend). O valor atual no form é fixo (0 ao criar; valor vigente ao editar)
pois só muda via aporte.

## Camada de dados

- **Tipos** — `app/src/types/finance.ts`: `Investment`, `InvestmentContribution`,
  `InvestmentProjection`, `InvestmentType`, mais `INVESTMENT_TYPE_LABELS/HEX/ORDER`.
- **API** — `app/src/lib/api.ts`: `api.investments.*` e `api.investments.contributions.*`.
- **Hooks** — `app/src/lib/queries.ts`: `useInvestments`, `useInvestment`,
  `useCreate/Update/DeleteInvestment`, `useContributions`, `useCreate/DeleteContribution`.
  Mutações de aporte invalidam `keys.investments.all` (o `currentAmount` muda) **e** o
  histórico daquele investimento.
