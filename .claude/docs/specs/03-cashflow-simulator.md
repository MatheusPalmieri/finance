---
title: Spec — Projeção de fluxo de caixa e simulador "posso comprar?"
area: specs
status: IMPLEMENTADO
updated: 2026-09-19
---

## Resumo

Projeta o saldo dos próximos 1 a 12 meses a partir dos gastos fixos
(orçamentos), da distribuição histórica dos gastos variáveis e da receita
recorrente — e responde, com probabilidade, à pergunta que o usuário realmente
faz: **"dá pra comprar isso?"**.

Diferente das outras duas specs, esta é **matemática pura**. A IA aqui é
opcional e cosmética: traduzir "um notebook de 4 mil em 10x sem juros" nos
parâmetros do simulador. O formulário manual existe sempre e é a via principal.

- **Pré-requisito:** nenhum. Roda sobre o schema atual.
- **Opcional:** [`00-llm-provider.md`](./00-llm-provider.md) para a entrada em
  linguagem natural (fase 4, pode ser dispensada).
- **Esforço:** médio (2 a 3 dias)
- **Custo de IA:** ~zero; sem IA, literalmente zero.

---

## Por que isto vale mais que parece

O app hoje é retrospectivo: todas as telas olham para trás. Orçamento é
catálogo de plano, não previsão. Nenhuma tela responde "vou fechar o mês no
azul?". É a funcionalidade com maior distância entre esforço e valor percebido,
e a única das três que nenhum concorrente gratuito faz bem em pt-BR.

---

## Modelo de projeção

Horizonte em meses (`horizonMonths`, 1–12, default 6), a partir do mês corrente.
Escopo por carteira (`walletId`).

### Saldo inicial

`sum(accounts.balance)` das contas com `type != "CREDIT_CARD"`. Cartão de
crédito tem saldo com semântica de fatura, não de dinheiro disponível —
incluí-lo distorceria a projeção. A resposta traz `openingBalance` e a lista de
contas consideradas, para a UI poder explicar de onde saiu o número.

### Componentes do fluxo mensal

| Componente | Origem | Natureza |
|---|---|---|
| Receita recorrente | Média das entradas (`amount < 0`) dos últimos 6 meses, por `merchantKey`/nome, só as que aparecem em ≥ 4 dos 6 meses | determinística |
| Gastos fixos | `budgets` com `amountType: "fixed"` → `amount`; com `variable` → distribuição triangular entre `amountMin` e `amountMax`, moda na mediana do realizado | mista |
| Gastos variáveis | Bootstrap do histórico por categoria (ver abaixo) | estocástica |
| Lançamentos conhecidos | Transações já cadastradas com data futura | determinística |
| Cenário simulado | Parcelas e recorrências que o usuário está testando | determinística |

### Gastos variáveis — bootstrap por categoria

Para cada categoria com gasto `recurrence: "variable"`:

1. Monta a série dos **12 últimos meses** de total mensal daquela categoria
   (meses sem gasto entram como 0 — a ausência é informação).
2. Exige `>= 3` meses de histórico; abaixo disso a categoria entra como
   constante igual à média (e é sinalizada em `lowConfidenceCategories`).
3. Em cada iteração da simulação, sorteia um mês da série com reposição
   (*bootstrap*), preservando a forma real da distribuição.
4. Aplica um fator de tendência opcional: regressão linear simples sobre os 12
   pontos; se `|inclinação| > 3% ao mês` e `R² > 0.5`, projeta a tendência
   limitada a ±20% no horizonte. Caso contrário, sem tendência. (Extrapolar
   tendência fraca é o erro clássico deste tipo de modelo — o corte por R² é
   deliberado.)

Bootstrap em vez de normal/lognormal porque gasto pessoal é assimétrico e
multimodal (meses com viagem, meses sem), e a amostra é pequena — reamostrar o
histórico real dá calibração melhor que qualquer distribuição paramétrica
ajustada a 12 pontos.

### Monte Carlo

- `N = 5 000` iterações (`SIMULATION_RUNS`). Em Bun, ~30ms para 6 meses × 15
  categorias. Sem worker, sem fila.
- Semente **fixa e configurável** (`seed`, default derivado de
  `month|year|walletId`): a mesma projeção consultada duas vezes devolve o mesmo
  número. Usuário não pode ver o gráfico mudar sozinho ao dar F5. Usar um PRNG
  simples (mulberry32) em `random.ts` — não `Math.random()`.
- Saída por mês: `p10`, `p25`, `p50`, `p75`, `p90` do saldo acumulado, mais
  `probNegative` (fração das iterações em que o saldo daquele mês ficou < 0).

### Saída da projeção

```ts
interface CashflowProjection {
  openingBalance: number
  openingAccounts: { id: string; name: string; balance: number }[]
  months: {
    month: number
    year: number
    label: string            // "out/26"
    expectedIncome: number
    fixedExpenses: number
    variableExpensesP50: number
    knownTransactions: number
    scenarioImpact: number   // 0 quando não há cenário
    balance: { p10: number; p25: number; p50: number; p75: number; p90: number }
    probNegative: number
  }[]
  /** Resumo do horizonte inteiro */
  summary: {
    endBalanceP50: number
    worstMonthLabel: string
    minBalanceP10: number
    /** Probabilidade de o saldo ficar negativo em ALGUM mês do horizonte */
    probAnyNegative: number
  }
  /** Transparência obrigatória do modelo */
  assumptions: {
    historyMonths: number
    lowConfidenceCategories: string[]
    categoriesWithTrend: { categoryName: string; monthlyPct: number }[]
    simulationRuns: number
    seed: number
  }
}
```

O bloco `assumptions` não é enfeite: é o que permite ao usuário saber que a
projeção de uma base com 2 meses de dados não vale nada. A UI precisa mostrá-lo.

---

## Simulador de cenário

Um cenário é uma lista de eventos aplicados por cima da projeção base.

```ts
type ScenarioEvent =
  | {
      kind: "installment_purchase"
      label: string
      totalAmount: number
      installments: number          // 1 = à vista
      monthlyInterestPct?: number   // default 0
      startMonth?: string           // "2026-11"; default próximo mês
      categoryId?: string
    }
  | {
      kind: "recurring_change"
      label: string
      monthlyAmount: number         // positivo = novo gasto; negativo = corte
      startMonth?: string
      endMonth?: string
      categoryId?: string
    }
  | {
      kind: "one_off"
      label: string
      amount: number                // positivo = gasto; negativo = entrada
      month: string
    }
  | {
      kind: "income_change"
      label: string
      monthlyAmount: number         // delta na receita mensal
      startMonth?: string
    }
```

Parcela com juros: `parcela = total * i / (1 - (1+i)^-n)` quando
`monthlyInterestPct > 0`; divisão simples quando zero. O cálculo fica em
`installments.ts`, puro e testado — é o tipo de fórmula que se erra em silêncio.

### Veredito do "posso comprar?"

Rodando a projeção com e sem o cenário, o motor emite um veredito
**determinístico** (não é a IA que decide):

| Veredito | Condição |
|---|---|
| `safe` | `probAnyNegative < 5%` e `minBalanceP10` continua acima da reserva mínima |
| `tight` | `probAnyNegative` entre 5% e 25%, ou a reserva mínima é furada no p10 |
| `risky` | `probAnyNegative` entre 25% e 60% |
| `no` | `probAnyNegative >= 60%` ou o p50 fica negativo em algum mês |

**Reserva mínima** = parâmetro do usuário (`minimumReserveBrl`, default =
1 mês de gastos essenciais medianos), guardado em `app_settings` (ver abaixo).

Junto do veredito, dados acionáveis calculados, não opinados:

- `maxAffordableTotal` — busca binária sobre `totalAmount` até o veredito virar
  `tight`: "o teto para este parcelamento é R$ 5 800".
- `saferInstallments` — o menor número de parcelas que mantém `safe`.
- `bestStartMonth` — o mês de início dentro do horizonte que dá o melhor p10.

### Comparação lado a lado

A resposta de `POST /forecast/simulate` traz `base` e `withScenario` (ambos
`CashflowProjection`) mais o `verdict`, para a UI desenhar as duas curvas
sobrepostas.

---

## Configurações (`app_settings`)

O projeto ainda não tem tabela de preferências. Esta spec introduz uma mínima,
singleton:

```ts
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1), // sempre 1 — check constraint
  minimumReserveBrl: numeric("minimum_reserve_brl", { precision: 12, scale: 2 }),
  defaultHorizonMonths: integer("default_horizon_months").default(6).notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})
```

`minimumReserveBrl` nulo = usar o default calculado. `GET/PUT /settings`.

---

## Módulo backend

```
api/src/modules/forecast/
├── index.ts
├── routes.ts
├── service.ts          # monta os insumos e orquestra
├── history.ts          # séries históricas por categoria e receita recorrente
├── montecarlo.ts       # o laço de simulação e os percentis
├── scenario.ts         # aplica ScenarioEvent[] sobre a projeção
├── installments.ts     # matemática de parcelamento
├── verdict.ts          # veredito + busca binária do teto
├── random.ts           # mulberry32 (PRNG com semente)
├── parse.ts            # (fase 4) linguagem natural → ScenarioEvent[]
├── types.ts
├── montecarlo.test.ts
├── installments.test.ts
├── verdict.test.ts
└── history.test.ts
```

Todo o núcleo (`montecarlo`, `installments`, `verdict`, `random`) é de funções
puras que recebem dados e devolvem dados — sem `db`, sem `fetch`. Só
`history.ts` e `service.ts` tocam o banco. É o que torna esta spec
desproporcionalmente fácil de testar.

---

## API

Prefixo `/forecast`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/forecast/cashflow` | `?horizonMonths=6&walletId=` → `CashflowProjection` base |
| POST | `/forecast/simulate` | `{ walletId?, horizonMonths?, events: ScenarioEvent[] }` → `{ base, withScenario, verdict }` |
| POST | `/forecast/afford` | `{ walletId?, totalAmount, installments?, monthlyInterestPct?, label?, categoryId? }` → atalho de `simulate` com um único evento, resposta focada no veredito |
| POST | `/forecast/parse` | *(fase 4)* `{ text: string }` → `{ events: ScenarioEvent[], interpretation: string, aiAvailable: boolean }` |
| GET | `/settings` / PUT | Preferências |

`GET /forecast/cashflow` é cacheável no React Query por 5 min
(`staleTime: 300_000`) — a projeção só muda quando muda transação ou orçamento,
então invalidar em `keys.transactions.all` e `keys.budgets.all` é suficiente.

### `POST /forecast/parse` — o único ponto de IA

Schema zod = o array de `ScenarioEvent` acima. Prompt recebe: a data de hoje,
a lista de categorias (`id` + `name`) e a frase. Regras no system prompt:
não inventar valor que não esteja na frase; `installments: 1` quando a frase não
mencionar parcelamento; `monthlyInterestPct: 0` quando não mencionar juros;
devolver array vazio se a frase não descrever um evento financeiro.

**A resposta nunca é aplicada direto.** Ela pré-preenche o formulário do
cenário, com o campo `interpretation` mostrado como "entendi assim: …" e os
valores editáveis. O usuário confirma. Isso elimina toda a classe de bug em que
um erro de interpretação vira um número errado na tela.

---

## Frontend

### Nova página `/forecast`

Rota lazy em `App.tsx`, item na sidebar (ícone `TrendingUp`).

**1. Gráfico de leque (fan chart)** — o elemento central. `ComposedChart` do
recharts: duas `Area` empilhando as bandas p10–p90 e p25–p75 (opacidade
crescente para dentro), uma `Line` sólida no p50, `ReferenceLine` em zero e uma
`ReferenceLine` tracejada na reserva mínima. Meses com `probNegative > 25%`
ganham fundo destacado.

Carregar a skill `dataviz` antes de escrever o gráfico. Paleta de
`lib/tokens.ts`; verde da paleta para as bandas, `FINANCE.expense` para a área
abaixo de zero.

**2. Faixa de veredito do horizonte** — "80% de chance de fechar os 6 meses
sempre no positivo", com a cor do veredito.

**3. Tabela mês a mês** — receita, fixos, variáveis (p50), saldo p50 e uma
mini-barra de risco. Linha expansível mostrando a composição.

**4. Painel de cenário** (lateral em desktop, drawer em mobile — seguir
`.claude/docs/frontend/responsive.md`):

- Campo de texto livre no topo: *"O que você está pensando em comprar?"* →
  `POST /parse` → preenche o formulário abaixo. Quando `aiAvailable: false`, o
  campo simplesmente não é renderizado.
- Formulário do evento: label, valor, parcelas (stepper 1/2/3/6/10/12), juros ao
  mês, mês de início, categoria.
- Lista de eventos adicionados, cada um removível — dá para empilhar cenários
  ("comprar o notebook **e** cortar o streaming").
- Botão "Simular" → a curva do cenário aparece pontilhada sobre a base.

**5. Card de resultado** — veredito grande, e os três acionáveis:
"teto seguro: R$ 5 800", "em 12x fica tranquilo", "começando em dezembro o
risco cai para 4%". Cada um é um botão que reconfigura o cenário e re-simula.

**6. Card de premissas** — recolhido por padrão, abre mostrando `assumptions`.
Quando `historyMonths < 3` ou há categorias em `lowConfidenceCategories`,
mostrar um aviso **não recolhido**: "projeção baseada em pouco histórico".

### Card no Home

"Projeção do mês": saldo previsto para o fim do mês corrente (p50) e a
probabilidade de fechar positivo. Link para `/forecast`.

### Camada de dados

```ts
forecast: {
  all: ["forecast"] as const,
  cashflow: (params: ForecastParams) => [...keys.forecast.all, "cashflow", params] as const,
},
settings: { all: ["settings"] as const },
```

`useSimulate()` e `useParseScenario()` como `useMutation`.

---

## Testes

- `installments.test.ts` — sem juros: 4000 em 10x = 400,00 exatos; com 2% a.m.:
  conferir contra valor calculado à mão; `installments: 1` devolve o total;
  juros negativo ou parcelas ≤ 0 lançam erro tipado.
- `random.test.ts` — mesma semente, mesma sequência; sementes diferentes
  divergem.
- `montecarlo.test.ts` — com série histórica constante, todos os percentis
  coincidem e `probNegative` é 0 ou 1 (nunca intermediário); percentis são
  monotônicos (`p10 <= p25 <= p50 <= p75 <= p90`) em toda saída; duas execuções
  com a mesma semente são idênticas; 5 000 iterações rodam em menos de 500ms.
- `verdict.test.ts` — cada faixa de `probAnyNegative` cai no veredito certo nos
  limites exatos (5%, 25%, 60%); a busca binária de `maxAffordableTotal`
  converge e o valor encontrado realmente devolve `tight` ao ser simulado.
- `history.test.ts` — meses sem gasto entram como 0; categoria com 2 meses vai
  para `lowConfidenceCategories`; tendência com R² baixo é ignorada; receita que
  aparece em 3 de 6 meses não é considerada recorrente.
- `parse.test.ts` — com `__setLlm(mock)`: frase sem valor devolve array vazio;
  `categoryId` fora da lista vira `null`; falha do LLM devolve
  `aiAvailable: false` e não 500.

Manual, na carteira **`Claude`**: importar os dois CSVs reais (nov e dez/2025),
gerar a projeção e conferir que o saldo inicial bate com a soma das contas não
cartão.

---

## Fases de implementação

1. **Motor determinístico** — `history.ts`, `installments.ts`, `random.ts`,
   `montecarlo.ts` e `GET /forecast/cashflow`. Validável por JSON e testes.
   *(~8h)*
2. **Página `/forecast` com o fan chart** e a tabela mensal. Já é entregável.
   *(~6h)*
3. **Cenários** — `scenario.ts`, `verdict.ts`, `POST /simulate` e `/afford`,
   painel de cenário, card de resultado com os acionáveis. *(~8h)*
4. **Entrada em linguagem natural** — `parse.ts` e o campo de texto. Depende de
   [`00`](./00-llm-provider.md). Dispensável. *(~3h)*
5. **Configurações e card no Home** — `app_settings`, reserva mínima. *(~3h)*

A fase 1+2 sozinha já entrega a resposta para "vou fechar o mês no azul?".

---

## Critérios de aceite

- [ ] `openingBalance` é a soma exata das contas não cartão de crédito da
      carteira, e a resposta lista quais entraram.
- [ ] A mesma projeção consultada duas vezes devolve números idênticos.
- [ ] Os percentis são sempre monotônicos (coberto por teste).
- [ ] Uma compra em 10x sem juros aplica exatamente `total/10` em 10 meses
      consecutivos a partir do mês de início.
- [ ] Simular um gasto absurdo (R$ 500 000) devolve veredito `no` sem travar
      nem estourar o tempo de resposta.
- [ ] Base com menos de 3 meses de histórico gera projeção com aviso visível de
      baixa confiança, e não um número apresentado como certeza.
- [ ] A projeção funciona com `LLM_ENABLED=false` (só o campo de texto some).
- [ ] Nenhum número exibido vem da resposta do LLM — a IA só preenche campos de
      formulário que o usuário confirma.
- [ ] `bun run typecheck` e `bun run lint` limpos.
- [ ] Docs: `.claude/docs/domain/forecast.md`, `.claude/docs/api/forecast.md`,
      `.claude/docs/frontend/forecast.md`.
