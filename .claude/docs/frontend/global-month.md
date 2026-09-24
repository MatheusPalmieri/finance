---
title: Frontend — Seletor de mês global
---

# Seletor de mês global

O mês/ano selecionado é um **filtro global**, não um estado por página. Fica na
sidebar (rodapé, acima do tema) e no drawer mobile.

## Peças

- `components/period-provider.tsx` — `PeriodProvider` (montado em `main.tsx`,
  fora do router, então o mês sobrevive à troca de página) e o hook
  `usePeriod()` → `{ month, year, isCurrentMonth, prevMonth, nextMonth }`.
  Inicia no mês atual; não navega para o futuro.
- `components/layout/MonthPicker.tsx` — UI. `compact` (sidebar recolhida)
  empilha as setas e mostra só a abreviação do mês.

## Quem consome

| Página | Como usa |
|--------|----------|
| Home | `useDashboardSummary({ month, year })`. Cards de saldo, projeção e check-up seguem o próprio escopo (saldo atual, futuro, mês anterior). |
| Transações | `monthRange(month, year)`. Trocar o mês descarta o "período específico" e volta à página 1. |
| Check-up | Gera (sob demanda) e mostra o relatório do mês global. Deixou de abrir em `/current`. |
| Previsão | Não usa — o horizonte é futuro (3/6/12 meses). |

Novas telas que dependam de mês devem usar `usePeriod()` — não criar `useState`
próprio de mês.
