---
title: Projeção de fluxo de caixa e simulador "posso comprar?"
area: domain
updated: 2026-09-23
---

## Visão geral

Projeta o saldo dos próximos 1 a 12 meses e responde, com probabilidade, à
pergunta que o usuário realmente faz: **"dá pra comprar isso?"**.

Diferente das specs 01 e 02, esta é **matemática pura**. A IA aqui é opcional e
cosmética: traduzir "um notebook de 4 mil em 10x" nos parâmetros do formulário.
O formulário manual existe sempre e é a via principal.

Implementa `.claude/docs/specs/03-cashflow-simulator.md`.
Código: `api/src/modules/forecast/`.

## Saldo inicial

`sum(accounts.balance)` das contas com `type != "CREDIT_CARD"`. Cartão de
crédito tem saldo com semântica de fatura, não de dinheiro disponível — incluí-lo
distorceria a projeção. A resposta traz `openingBalance` **e a lista de contas
consideradas**, para a UI poder explicar de onde saiu o número.

## Componentes do fluxo mensal

| Componente | Origem | Natureza |
|---|---|---|
| Receita recorrente | Entradas que aparecem em ≥ 4 dos últimos 6 meses, agrupadas por `merchantKey` | determinística |
| Gastos fixos | `budgets` com `amountType: "fixed"` | determinística |
| Orçamentos de faixa | `amountMin`/`amountMax` → distribuição triangular | estocástica |
| Gastos variáveis | Bootstrap do histórico por categoria | estocástica |
| Lançamentos conhecidos | Transações já cadastradas com data futura | determinística |
| Cenário simulado | Eventos que o usuário está testando | determinística |

### O mês corrente não é contado duas vezes

O saldo das contas já reflete o que foi gasto neste mês. Projetar o mês inteiro
por cima disso contaria em dobro. Então, no primeiro mês do horizonte:

- **fixos** entram pro-rata pela fração do mês que ainda falta;
- **receita esperada** desconta o que já foi recebido (com piso em zero);
- **componentes estocásticos** são escalados por `remainingFraction`.

Dos meses seguintes em diante, `remainingFraction` é 1.

### Gastos variáveis — bootstrap por categoria

1. Série dos **12 últimos meses** de total mensal da categoria. **Meses sem
   gasto entram como 0** — a ausência é informação, e descartá-los inflaria a
   projeção.
2. Menos de 3 meses **com gasto** → a categoria entra como constante igual à
   média e é sinalizada em `lowConfidenceCategories`.
3. A cada iteração, sorteia um mês da série **com reposição**.
4. Tendência opcional: regressão linear sobre os 12 pontos. Só é aplicada se
   `|inclinação| > 3% ao mês` **e** `R² > 0,5`, e fica limitada a ±20% no
   horizonte.

Bootstrap em vez de normal/lognormal porque gasto pessoal é assimétrico e
multimodal (meses com viagem, meses sem), e a amostra é pequena — reamostrar o
histórico real calibra melhor que qualquer distribuição paramétrica ajustada a
12 pontos.

> Extrapolar tendência fraca é o erro clássico deste tipo de modelo. O corte por
> R² é deliberado, não conservadorismo.

## Monte Carlo

- `SIMULATION_RUNS = 5000`. Em Bun, ~30ms para 6 meses × 15 categorias. Sem
  worker, sem fila.
- **Semente fixa**, derivada de `ano-mês-global` por FNV-1a (o sufixo `global` preserva as sementes de antes da remoção das carteiras). A mesma projeção
  consultada duas vezes devolve exatamente os mesmos números — o usuário não
  pode ver o gráfico mudar sozinho ao dar F5. O PRNG é `mulberry32` em
  `random.ts`, nunca `Math.random()`.
- Saída por mês: `p10`, `p25`, `p50`, `p75`, `p90` do saldo acumulado, mais
  `probNegative`. No resumo, `probAnyNegative` é a fração das iterações em que o
  saldo ficou negativo em **algum** mês — um horizonte pode fechar no azul tendo
  passado pelo vermelho no caminho.

## Cenários

Um cenário é uma lista de eventos aplicados por cima da projeção base. Podem ser
empilhados ("comprar o notebook **e** cortar o streaming").

| `kind` | O que faz |
|---|---|
| `installment_purchase` | Compra parcelada ou à vista |
| `recurring_change` | Gasto recorrente novo, ou corte (valor negativo) |
| `one_off` | Gasto ou entrada única num mês |
| `income_change` | Delta na renda mensal |

Regras de borda, todas testadas: parcelas que passam do fim do horizonte são
truncadas; um início anterior ao horizonte é tratado como "já está correndo" e
entra no primeiro mês; um início posterior ao horizonte não impacta nada; sem
`startMonth`, o default é o **próximo** mês, não o corrente.

### Parcelamento

- Sem juros: divisão simples.
- Com juros: Tabela Price, `parcela = total * i / (1 - (1+i)^-n)`.
- **1x nunca rende juros**, mesmo que uma taxa tenha sido informada — é o que
  "à vista" significa para quem preenche o formulário.

`installments.ts` é puro e testado: é o tipo de fórmula que se erra em silêncio
e só aparece como um número levemente errado no gráfico.

## Veredito

Determinístico. **Não é a IA que decide.**

| Veredito | Condição |
|---|---|
| `safe` | `probAnyNegative < 5%` e a reserva mínima não é furada no p10 |
| `tight` | `probAnyNegative` entre 5% e 25%, **ou** a reserva é furada |
| `risky` | `probAnyNegative` entre 25% e 60% |
| `no` | `probAnyNegative ≥ 60%` **ou** o p50 fica negativo em algum mês |

O p50 negativo derruba direto para `no` porque significa que o resultado
*típico* já é vermelho — pior do que a probabilidade sozinha sugere.

**Reserva mínima**: `app_settings.minimumReserveBrl`, ou, quando nula, o default
calculado (mediana mensal dos gastos essenciais).

### Acionáveis

Calculados, não opinados:

- `maxAffordableTotal` — busca binária sobre `totalAmount` até o limite em que o
  veredito ainda é aceitável (`safe` ou `tight`), com precisão de R$ 50.
- `saferInstallments` — o menor número de parcelas que devolve `safe`, nunca
  menor que o pedido.
- `bestStartMonth` — o mês de início, dentro do horizonte, com o melhor p10.

Todas as simulações da busca reaproveitam os mesmos insumos: o banco é lido uma
vez só por chamada de `/afford`.

## Transparência (`assumptions`)

Não é enfeite: é o que permite ao usuário saber que a projeção de uma base com 2
meses de dados não vale nada. A UI **precisa** mostrá-lo.

Inclui `historyMonths`, `lowConfidenceCategories`, `categoriesWithTrend`,
`simulationRuns`, `seed`, a reserva mínima usada (e se veio do default) e
`recurringIncome`.

> `recurringIncome` vazio é o sinal mais importante da tela. Sem receita
> recorrente detectada a projeção só enxerga saídas e o saldo despenca — a UI
> avisa explicitamente, senão o usuário lê um gráfico assustador sem entender
> que falta informação, não que ele vá quebrar.

## Degradação sem IA

A projeção inteira, o simulador, o veredito e os acionáveis funcionam com
`LLM_ENABLED=false`. Só o campo de texto livre some da UI.
`POST /forecast/parse` nunca responde 500: falha do provedor vira
`aiAvailable: false` com lista de eventos vazia.

**Nenhum número exibido vem da resposta do LLM** — a IA só pré-preenche campos
de formulário que o usuário confirma.

## Onde olhar

| Assunto | Arquivo |
|---|---|
| Contrato HTTP | `.claude/docs/api/forecast.md` |
| Tela | `.claude/docs/frontend/forecast.md` |
| Camada de IA | `.claude/docs/api/llm.md` |
| Código | `api/src/modules/forecast/` |


## Saldo de abertura ao vivo (spec 04, F5)

`loadOpeningBalance()` em `forecast/service.ts`:

| Conta | Entra como |
|---|---|
| Ligada ao Open Finance, conta corrente | saldo **ao vivo** da Pluggy |
| Ligada ao Open Finance, cartão | **negativo**: "<cartão> (fatura em aberto)" = usado do limite − parcelas futuras já em `transactions`. As parcelas entram no mês em que caem (`knownTransactions`); descontá-las aqui evita contá-las duas vezes |
| Sem vínculo (não cartão, não sandbox) | `accounts.balance` cadastrado |

`CashflowProjection.openingBalanceSource`: `"live"` ou `"stored"` (sem Open
Finance, ou com a Pluggy fora do ar: aí as contas ligadas também caem no
cadastrado). Os movimentos internos (fatura, RDB, transferência própria) ficam
fora do histórico que alimenta a simulação (`COUNTED_TRANSACTIONS`).
