---
title: Frontend — Início (Home)
area: frontend
updated: 2026-09-30
---

# Início (`pages/Home.tsx`)

Proposta aprovada no artefato "Nova Home Finance": cada número aparece uma vez,
no bloco certo. Quatro blocos, de cima para baixo:

| # | Bloco | Fonte |
|---|-------|-------|
| 1 | **Posição agora** — Saldo em conta · Fatura aberta · Investido, com Patrimônio líquido no rodapé | `useBalances`, `useInvestments` (retrato do Open Finance) |
| 2 | **Gastos do mês** — total (com ritmo vs mês anterior no mesmo dia), compras no cartão, essencial, variável + barra de composição | `GET /dashboard/summary` |
| 3 | **Para onde foi** — Gasto por mês (barras) e Por categoria (top 5 + "Outras") | idem |
| 4 | **O que vem** — Projeção e Check-up (esticam à altura de Recentes) + Recentes | `useCashflow`, `useCurrentReport`, `recentTransactions` |

## Decisões

- **Selo de sincronização só no cabeçalho** (`SnapshotStatus`), não em cada card.
- **Cada banco é uma linha** dentro da coluna de saldo/fatura, com a cor da
  conta. O lápis (aparece no hover no desktop) abre `AccountModal`
  (`components/accounts/AccountModal.tsx`): só nome e cor — o resto é do banco.
  Substituiu a antiga `AccountsSection` (grid de cards de conta).
- **Fatura** = soma de `bill.total` dos cartões, sempre vermelha. O título é
  "Fatura fechada" quando o banco já deu o valor oficial (`bill.official`) e
  "Fatura aberta" com a nota "Estimativa pela soma das compras" quando não.
  Diferença entre o oficial e o detalhado aparece como "R$ X cobrados sem
  detalhe do banco". O vencimento ao lado do cartão é o da fatura
  (`bill.dueDate`). A barra mostra a dívida total sobre o limite. **Compras no cartão** (gastos do mês) é
  outra base — compras por data, não o ciclo da fatura — por isso o nome
  diferente.
- **Patrimônio** = conta + investido − dívida total dos cartões. É derivado, então
  vira rodapé com a fórmula escrita.
- **Essencial / Variável / Investimento** vêm do grupo 50/30/20 da categoria
  (`expensesByGroup`), a mesma regra da tela de Orçamentos.
- **Barra de composição**: essencial, variável, investimento e **sem
  classificação** (hachurada, com atalho "Classificar N →"). "Sem
  classificação" = transação na categoria de reserva do sync (`Outros`); ver
  `api/transactions.md`.
- **Tendência**: o mês em curso vem marcado "(parcial)" e fica fora da média
  (tracejada).
- **Recentes**: só datas até hoje; mostra o banco quando há mais de uma conta.
- Saíram da Home: "Por forma de pagamento" e "Por conta" (o cartão já está nos
  KPIs). A pizza de categorias virou barras.
- `formatCurrencyCompact` agora é pt-BR (`R$ 10,5 mil`); valores principais usam
  o valor cheio.

## Não aplicado da proposta

- **Projeção (B4)**: o motor ainda soma investimentos com liquidez diária ao
  saldo inicial, então "deve fechar o mês com" parte de uma base maior que o
  saldo em conta. Corrigir é mudança no motor (`domain/forecast.md`), à parte.
- Marca "ESS" nas categorias essenciais.
