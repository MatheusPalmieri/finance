---
title: Frontend — Página de Orçamentos
area: frontend
updated: 2026-09-25
---

# Página de Orçamentos (`/budgets`)

`app/src/pages/Budgets/index.tsx`. Redesenhada em 2026-09-25: os cards
viraram um resumo do plano contra a meta 50/30/20 e uma tabela compacta.

## Peças

- **Cabeçalho** — mês do seletor global (`usePeriod`), toggle **"Faixas pelo
  Mínimo / Médio / Máximo"** (`ToggleGroup`, só aparece se houver orçamento em
  faixa; padrão Médio) e "Novo orçamento".
- **`SummaryCard`** — total planejado e % da **renda do mês**, sobra, realizado
  do mês. Duas barras empilhadas: plano (em % da renda) e meta 50/30/20, com
  escala que estica se o plano passar de 100%. Três colunas **Fixo / Variável /
  Investimento** (`GroupStat`): planejado, % da renda, chip de distância da
  meta em p.p. (nos gastos, acima é alerta; no investimento, abaixo é) e
  realizado com barra de uso. Investimento mostra "aplicado − resgatado".
- **Tabela** — um `<tbody>` por grupo (`BudgetGroup`), cabeçalho clicável que
  recolhe (sempre aberto durante a busca) com subtotal planejado e realizado.
  Linha: nome, selo "Valor exato"/"Faixa", valor, gasto no mês com barra de uso
  (contra o teto; vermelho acima de 100%) ou "sem vínculo", % do grupo e ações
  (editar/excluir, visíveis no hover no desktop).

## Dados

- `useBudgets()` (lista completa; a busca filtra só a tabela) e
  `useBudgetSummary({ month, year })` → `GET /budgets/summary`.
- A chave `["budgets", "summary", …]` fica sob `keys.budgets.all`, invalidada
  pela reclassificação de transação, por "aplicar regra" e pelo sync.
- Sem renda no mês, a % vira "—" e as barras somem.

Regra de cada grupo e nomes em `domain/budget.md`.
