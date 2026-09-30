---
title: ADR — Orçamento por categoria e grupo 50/30/20 na categoria
area: decisions
updated: 2026-09-30
---

## Visão geral

O orçamento deixou de ser um item vinculado a transações e virou o **plano
mensal de uma categoria**. O grupo 50/30/20 (Essencial / Variável /
Investimento) passou a morar na **categoria**. Saíram da transação os campos
`recurrence` ("Recorrente/Avulso"), `isEssential` e `budgetId`.

## Contexto

A validação do fluxo em 2026-09-26 encontrou:

- **Vínculo acoplado à recorrência:** só gasto "Recorrente" podia ter orçamento.
  O orçamento Combustível (R$ 500) tinha 0 transações vinculadas, porque os 47
  abastecimentos eram "Avulso".
- **Automação quebrada:** o kNN nunca propagava orçamento. Nenhuma tela chamava
  o aprendizado. Só as regras feitas à mão vinculavam.
- **Três fórmulas de 50/30/20:** Orçamentos usava o vínculo, o check-up usava
  vínculo ou `isEssential`, e a projeção usava só `isEssential`. Os números não
  batiam; agosto mostrava investimento de R$ 4.221 em uma tela e R$ 0 na outra.
- **Dupla contagem na projeção:** orçamento + histórico da mesma categoria, e
  orçamento + parcela futura vinculada.

## Decisão

| Antes | Agora |
|---|---|
| `budgets` com `name` e `type` | `budgets.category_id` (único, `on delete cascade`); nome e cor vêm da categoria |
| `transactions.budget_id`, `recurrence`, `is_essential` | Removidos. O gasto conta no orçamento e no grupo da sua categoria |
| `classification_rules.budget_id`, `recurrence`, `is_essential`, `force_income` | Removidos. A regra define nome, categoria e forma de pagamento |
| enum `budget_type` (`essential`/`desire`/`investment`) | enum `spending_group` (`essential`/`variable`/`investment`) em `categories.group` |
| `budget_amount_type` `fixed`/`variable` | `exact`/`range` — "variável" passa a ter um único sentido: o grupo |
| Três fórmulas de 50/30/20 | Uma: `lib/spending.ts`, com base na renda do mês |

Outras decisões tomadas junto:

- Nova categoria **Mercado** (essencial), separada de **Alimentação**
  (variável, para comer fora).
- O kNN passa a indexar pelo nome do banco (`originalName`).

## Consequências

- Classificar a categoria certa passa a ser **tudo** que o usuário faz. Regra e
  kNN já resolvem a categoria, então o orçamento fica automático.
- Some o acompanhamento item a item ("o Spotify não cobrou"). Quem cobre isso é
  o detector de cobranças recorrentes (aba Recorrentes em Regras), que não mudou.
- Um orçamento migrado de um item isolado passa a cobrir a categoria inteira.
  Exemplo: Academia (R$ 78,75) virou o orçamento de Saúde, que também inclui
  farmácia. Os valores precisam ser revistos na tela.

## Migração do banco de dev

`api/scripts/migrate-budgets-by-category.sql`, numa transação só (comando no
cabeçalho do arquivo). Faz backup antes em `backups/`:

1. Criar `spending_group`, adicionar `categories.group` e definir os grupos
   padrão: Moradia, Transporte, Saúde, Estudos, Serviços e Mercado =
   essencial; Investimento = investimento; o resto = variável.
2. Criar a categoria Mercado, apontar para ela as regras seed de supermercado e
   mover as transações de supermercado que ainda estão em Alimentação.
3. Somar os orçamentos antigos por categoria (a da regra vinculada, senão a das
   transações; Combustível → Transporte). Só valores exatos viram um valor
   exato; se houver alguma faixa, vira faixa.
4. Remover as colunas e os enums antigos e renomear os valores de
   `budget_amount_type`.
5. Apagar `monthly_reports`, que guardam o formato antigo, e gerá-los de novo.

**Aplicada em 2026-09-30.** Antes, rodou numa cópia restaurada do dump, onde o
`drizzle-kit push` respondeu "No changes detected". Resultado: 1078
transações preservadas, 76 compras movidas para Mercado e 13 orçamentos
consolidados em 8. Backup de antes em
`backups/finance-2026-09-30-pre-migracao.dump`.
