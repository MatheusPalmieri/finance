---
title: Frontend — Filtros e navegação por mês em Transações
area: frontend
updated: 2026-09-23
---

## Visão geral

A página de Transações (`app/src/pages/Transactions/index.tsx`) filtra por período usando os parâmetros `from`/`to` que já existiam em `GET /transactions` (ver `.claude/docs/api/transactions.md`) mas não eram usados pelo frontend até 2026-07-01. Agora a página sempre envia `from`/`to` — nunca lista "todo o histórico" sem filtro de data.

## Navegação por mês (padrão)

**Atualizado:** o mês agora vem do seletor global (`usePeriod()`, ver `global-month.md`); a página não tem mais setas próprias, só exibe o rótulo. O texto abaixo descreve o comportamento anterior das setas.

Mesmo padrão visual do `Home.tsx`: setas `ChevronLeft`/`ChevronRight` ao redor do rótulo `"{Mês} {Ano}"` (array `MONTHS` de `types/finance.ts`). Estado `month`/`year`, iniciado no mês atual. `nextMonth` fica desabilitado quando já está no mês atual (`isCurrentMonth`) — não é possível navegar para o futuro.

`monthRange(month, year)` (função local no arquivo) calcula o primeiro e o último dia ISO do mês.

## Período específico (popover)

Botão "Período específico" abre um `Popover` (`@/components/ui/popover`, Radix) com dois `Input type="date"` (`De` / `Até`):
- Ao clicar "Aplicar", vira o `customRange` ativo — some a navegação por mês e o rótulo passa a mostrar o intervalo (`dd/mm/yyyy – dd/mm/yyyy`).
- **Dia específico**: usar a mesma data em "De" e "Até" — o rótulo detecta isso (`isSingleDay`) e mostra só uma data.
- Datas invertidas pelo usuário são normalizadas automaticamente (menor vira `from`).
- Botão "Voltar para navegação por mês" (só aparece com `customRange` ativo) limpa o filtro e volta a usar `month`/`year`.
- Clicar nas setas de mês também sai do modo de período específico (`setCustomRange(null)`).

Qualquer mudança de período (mês ou período específico) reseta `page` para 1.

## Filtro por Forma de pagamento (2026-09-24)

`Select` "Todos os pagamentos" (`filterPaymentMethod`) na barra de filtros,
enviado como `paymentMethod` em `GET /transactions`. Opções vêm de
`PAYMENT_METHOD_ORDER`. Substituiu o filtro por conta (`accountId`), que
continua aceito pela API mas não tem mais controle na tela. Trocar a forma
reseta `page` para 1.

## Não confundir com o Dashboard (Home)

(Obsoleto — o mês é global.) `Home.tsx` tinha seu próprio `month`/`year` + navegação para `GET /dashboard/summary` — são estados independentes, cada página com o seu. Não há sincronização entre o mês do Dashboard e o mês de Transações.

## Cores do valor

Saída sempre em vermelho e **sem sinal de menos**; entrada em verde com "+".
Vale na lista de Transações, no modal de reclassificação e em "Recentes" do Início.
