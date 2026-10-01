---
title: Domínio — Orçamento (Budget)
area: domain
updated: 2026-09-30
---

## Visão geral

O orçamento é o **plano mensal de uma categoria**: "Moradia: R$ 2.750 a
2.950". Cada categoria tem no máximo um orçamento. O realizado é o gasto da
categoria no mês. Não existe vínculo por transação: classificar a categoria
basta. Decisão em `decisions/orcamento-por-categoria.md`.

O grupo da regra 50/30/20 (**Essencial / Variável / Investimento**) é um campo
da **categoria**, não do orçamento. Toda categoria tem grupo, com ou sem
orçamento.

## Campos

### `categories.group` (enum `spending_group`)

| Valor | Rótulo | Meta |
|---|---|---|
| `essential` | Essencial | 50% da renda |
| `variable` | Variável | 30% |
| `investment` | Investimento | 20% |

Default `variable`. Padrão da seed: Moradia, Mercado, Transporte, Saúde,
Estudos e Serviços = essencial; Investimento = investimento; o resto =
variável. Em categoria de entrada (Salário) o grupo não pesa, porque só saída
entra na distribuição.

### Tabela `budgets`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK |
| `categoryId` | uuid FK → categories, **único**, `on delete cascade` | A categoria planejada |
| `amountType` | enum `budget_amount_type` | `exact` (valor exato) \| `range` (faixa) |
| `amount` | numeric(10,2) | Só quando `exact` (> 0) |
| `amountMin` / `amountMax` | numeric(10,2) | Só quando `range` (mín ≥ 0, mín < máx) |

Validação em `api/src/routes/budgets.ts` (`validateAmounts`). Os campos que não
se aplicam à forma ficam nulos.

## Gasto do plano (regra única)

`api/src/lib/spending.ts` é a mesma conta para Orçamentos, check-up e Início:

- **Conta:** saída `regular` (amount > 0) e o **líquido** das aplicações
  (`kind = investment`: aplicação soma, resgate abate).
- **Fica fora:** fatura (`bill_payment`) e transferência entre contas próprias.
- Cada transação cai na sua categoria, e a categoria define o grupo.
- **Base da %:** a renda do mês, ou seja, as entradas `regular` (amount < 0).
  Proventos entram como renda.

Mudar o grupo de uma categoria move todo o gasto dela de grupo, inclusive o dos
meses anteriores.

**Limitação:** compras da mesma categoria sempre caem no mesmo grupo. O banco
não traz os itens, então a besteira comprada no mercado conta como essencial.
Hoje, o jeito de medir é o orçamento de Mercado como teto do essencial: o que
passa dele é excesso. Há uma exceção por transação proposta e ainda não
implementada em `decisions/excecao-grupo-por-transacao.md`.

## Onde o orçamento aparece

| Lugar | Uso |
|---|---|
| Tela de Orçamentos | Plano × gasto por categoria e por grupo (`frontend/budgets.md`) |
| Check-up | Situação de cada orçamento: `over` / `under` / `on_track` / `missing` (`domain/monthly-report.md`) |
| Projeção | Categoria com orçamento usa o plano no lugar do histórico e das parcelas futuras (`domain/forecast.md`) |

## Histórico

- 2026-07 — catálogo de itens nomeados (Aluguel, Internet…), com `type` 50/30/20
  e vínculo `transactions.budget_id` exigido quando o gasto era "Recorrente".
- 2026-09-25 — grupo `desire` exibido como "Variável"; "Recorrente/Avulso".
- 2026-09-30 — orçamento por categoria, grupo na categoria, fim do vínculo por
  transação e da recorrência.
