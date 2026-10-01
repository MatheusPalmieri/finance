---
title: ADR — Exceção de grupo 50/30/20 por transação (PROPOSTO)
area: decisions
updated: 2026-09-30
---

## Visão geral

**Status: PROPOSTO — não implementado.** Fica registrado para usar quando fizer
falta.

Hoje toda transação herda o grupo 50/30/20 da categoria (ver
`decisions/orcamento-por-categoria.md`). A proposta é um campo **opcional** na
transação que troca o grupo **só daquela compra**, para os casos em que a
categoria está certa mas a compra não é do grupo dela. Exemplo: uma compra de
"besteira" no mercado (Mercado é essencial) contaria como Variável.

## Problema

O Open Finance traz só o total da compra ("Giassi R$ 459,55"), sem os itens.
Então nenhuma regra automática separa o essencial do supérfluo dentro da mesma
categoria. A divisão depende de o usuário dizer ao sistema.

## Proposta

- Nova coluna `transactions.group_override spending_group null`. Vazio = herda
  a categoria (o padrão, e o caso de quase todas as transações).
- No modal "Reclassificar transação", só em saídas: "Contar nesta compra como"
  → *Grupo da categoria (padrão)* / Essencial / Variável / Investimento.
- A lista de Transações mostra um selo discreto quando a exceção está em uso.
- O sync nunca preenche nem sobrescreve o campo (é do usuário, como nome e
  categoria). Regras e kNN também não sugerem: é decisão caso a caso.

### Onde muda a conta

Em `api/src/lib/spending.ts`, o grupo efetivo passa a ser
`coalesce(transactions.group_override, categories.group)`. Orçamentos e o
check-up já usam esse módulo. Dois lugares leem `categories.group` direto e
também precisam do `coalesce`: o corte por grupo do Início
(`routes/dashboard.ts`) e a mediana de essenciais da reserva mínima
(`modules/forecast/history.ts`).

## Decisão em aberto

**A exceção também tira a compra do orçamento da categoria?**

| Opção | Efeito no exemplo do mercado |
|---|---|
| Só o grupo | A besteira conta em Variável no 50/30/20, mas continua no orçamento de Mercado |
| Grupo e orçamento | A besteira sai do orçamento de Mercado. Também sai do realizado de qualquer orçamento, porque fica sem categoria orçada no grupo novo |

Definir antes de implementar.

## Por que não as alternativas

| Alternativa | Motivo |
|---|---|
| Orçamento como régua (o que passa do teto de Mercado é excesso) | Já funciona hoje e continua valendo. Diz *quanto*, mas não *qual* compra |
| Dividir a transação em partes (R$ 350 essencial + R$ 109 variável) | Exige abrir a nota e dividir à mão; tabela de partes e todas as somas mudam. Custo alto para uso semanal |
| Percentual fixo por categoria (Mercado = 80/20) | Estimativa apresentada como dado — fere a regra de nada inventado (`decisions/open-finance-fonte-unica.md`) |
| Voltar ao `isEssential` obrigatório | Duplicava a categoria em toda transação e gerava as três fórmulas de 50/30/20 que foram removidas |

## Escopo estimado

Uma migração (uma coluna) e o PATCH `/transactions/:id` aceitando
`groupOverride`. O `coalesce` vai em `lib/spending.ts`, `routes/dashboard.ts` e
`modules/forecast/history.ts`. No front: um ToggleGroup no modal de reclassificação, o
selo na lista, os testes e as docs (`domain/budget.md`,
`domain/transaction.md`).
