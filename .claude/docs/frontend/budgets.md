---
title: Frontend — Página de Orçamentos
area: frontend
updated: 2026-09-30
---

## Visão geral

`app/src/pages/Budgets/index.tsx` (`/budgets`) mostra o plano por categoria
contra o gasto do mês global (`usePeriod`), agrupado pela regra 50/30/20. Dados:
`useCategories`, `useBudgets` e `useBudgetSummary`. Regras de negócio em
`domain/budget.md`.

## Estrutura

1. **Cabeçalho:** mês, toggle "Faixas pelo" Mínimo / Médio / Máximo (só aparece
   se houver alguma faixa; define quanto uma faixa soma nos totais) e o botão
   "Novo orçamento", desabilitado quando todas as categorias já têm orçamento.
2. **Resumo:** total planejado em % da renda, realizado no mês, barras Plano ×
   Meta (50/30/20) e um bloco por grupo com planejado, % da renda, desvio em
   p.p., realizado e barra de uso. Investimento mostra "aplicado − resgatado".
3. **Tabela "Categorias do mês":** agrupada por Essencial / Variável /
   Investimento (grupos colapsáveis). Entra toda categoria **com orçamento ou
   com gasto no mês**; as orçadas vêm primeiro, depois por gasto.

| Coluna | Conteúdo |
|---|---|
| Categoria | Cor + nome |
| Orçamento | "Valor exato", "Faixa" ou "sem orçamento" |
| Planejado | Valor ou faixa mín–máx |
| Gasto no mês | Link para Transações filtrada pela categoria e pelo mês (`?categoryId&from&to`) + barra de uso contra o teto (exato ou máximo da faixa) |
| Do grupo | Parte do planejado do grupo |
| Ações | Editar o plano; remover o orçamento (só se houver) |

## `BudgetModal` (`components/forms/BudgetModal.tsx`)

Plano da categoria, salvo com `useSaveCategoryPlan` (`PUT /budgets/:categoryId`):

- **Categoria:** fixa ao editar; ao criar, um Select só com as que ainda não
  têm orçamento. Escolher uma carrega o grupo dela.
- **Grupo:** ToggleGroup Essencial (50%) / Variável (30%) / Investimento (20%).
  Vale para todo gasto da categoria.
- **Orçamento mensal:** ToggleGroup Valor exato / Faixa / Sem orçamento. "Sem
  orçamento" grava só o grupo e remove o orçamento, se existir.

Remover pela lixeira (`useDeleteBudget`) tira só o orçamento: a categoria e o
grupo ficam. Salvar ou remover invalida orçamentos, categorias, Início,
projeção e check-up.

## Estados

- Carregando: dois skeletons.
- Erro de categorias ou orçamentos: `ErrorState`. Erro do resumo: `ErrorState`
  dentro do card.
- Sem orçamento e sem gasto no mês: estado vazio com "Criar primeiro orçamento".
