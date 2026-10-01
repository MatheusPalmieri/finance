---
title: ADR — Mês de referência pela fatura do cartão (PROPOSTO)
area: decisions
updated: 2026-09-30
---

## Visão geral

**Status: PROPOSTO — não implementado.**

Hoje toda análise mensal (Orçamentos, check-up, "Gastos do mês" no Início,
50/30/20, projeção) agrupa as transações pela **data da compra**. No cartão,
isso não bate com o mês em que o dinheiro sai: a compra feita depois do
fechamento entra na fatura seguinte. A proposta é cada transação ter um **mês
de referência**, e as análises mensais usarem ele.

## Problema (caso real, 2026-09)

| Compra | Data | Fatura (`billForecastDate`) | Hoje conta em | Será paga em |
|---|---|---|---|---|
| Giassi R$ 459,55 | 29/09 | 2026-11 | setembro | novembro |
| iFood Marmitas R$ 20,97 | 29/09 | 2026-11 | setembro | novembro |
| iFood Fogodeli R$ 43,97 | 27/09 | 2026-10 | setembro | outubro |

O fechamento do Nubank fica por volta do dia 28. Consequências:

- O mês fica com gasto que só sai da conta dois meses depois, e o planejamento
  com o salário não bate.
- Parcelas "pulam" mês: Amazon Prime com 6/12 em 27/06 e 7/12 em 30/06 (duas
  em junho, nenhuma em maio); Academia 2/12 em 31/08 e 3/12 em 20/10 (setembro
  vazio). O check-up acusa "estourou" e "sem lançamento" falsos.

## Proposta

- Nova coluna `transactions.reference_month` (`yyyy-mm`), do **banco** (o sync
  regrava a cada rodada, como `amount` e `date`):
  - **Cartão de crédito:** `creditCardMetadata.billForecastDate`, o mês da
    fatura (= mês do vencimento).
  - **Conta (Pix, débito, boleto, transferência):** o mês de `date`.
  - Cartão sem `billForecastDate` (raro): o mês de `date`.
- O histórico é preenchido na migração a partir de
  `pluggy_transactions.payload`, que já guarda o campo. Não precisa de dado novo
  da Pluggy.
- Todas as consultas **mensais** trocam `date between primeiro e último dia` por
  `reference_month = 'yyyy-mm'`:
  - `lib/spending.ts` (Orçamentos e check-up), `routes/dashboard.ts` (Gastos do
    mês, tendência, ritmo);
  - `modules/reports/metrics.ts` (totais, anomalias, movers);
  - `modules/forecast/history.ts` e `service.ts` (histórico, transações
    futuras, realizado do mês corrente).
- A tela de Transações continua mostrando e filtrando pela data da compra. O
  mês de referência aparece como detalhe quando difere ("fatura de nov").

## Efeitos

- "Gastos do mês" de outubro passa a mostrar a fatura que vence em outubro (as
  compras de ~29/08 a 28/09) mais o que saiu da conta em outubro.
- Cada parcela cai num mês só: some o falso "estourou"/"sem lançamento".
- O mês do orçamento passa a bater com o mês em que o dinheiro sai da conta.
- Renda (salário, Pix recebido) segue pela data, porque não passa pelo cartão.
- `billForecastDate` é uma previsão da Pluggy. Como o sync regrava os dados do
  banco a cada rodada, se o banco mudar a fatura de uma compra, o mês de
  referência acompanha.

## Pontos a decidir antes de implementar

- **Ritmo do Início** ("até o dia N do mês anterior"): com o cartão por fatura,
  o "dia" deixa de existir para essas compras. Opção: comparar só o fechado
  contra o fechado, ou usar a data para o ritmo.
- **Projeção:** o saldo inicial já desconta a fatura aberta. Com mês de
  referência, as compras pendentes da fatura aberta saem do "realizado do mês" e
  entram como saída conhecida do mês do vencimento. Confirmar que nada conta
  duas vezes.
- **Mês corrente parcial:** a fatura que vence no mês já está fechada; a
  seguinte ainda acumula. Definir o que "parcial" significa na tela.

## Escopo estimado

Uma migração (coluna + preenchimento + índice), o sync gravando o campo, e a
troca do filtro de data em cerca de 10 consultas. Testes de virada de fatura
(compra no dia do fechamento, parcela, estorno) e docs em `domain/transaction.md`,
`domain/budget.md`, `domain/monthly-report.md` e `domain/forecast.md`.
