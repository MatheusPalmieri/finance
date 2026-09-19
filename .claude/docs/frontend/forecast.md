---
title: Página /forecast — Projeção
area: frontend
updated: 2026-09-19
---

## Visão geral

Rota `/forecast`, item "Projeção" na sidebar (ícone `TrendingUp`). Escopada pela
carteira ativa (ver `.claude/docs/frontend/active-wallet.md`).

Arquivo: `app/src/pages/Forecast/index.tsx` (lazy em `App.tsx`).
Domínio: `.claude/docs/domain/forecast.md`.

É a primeira tela **prospectiva** do app — todas as outras olham para trás.

## Layout

Grid de duas colunas em desktop (`lg:grid-cols-[1fr_340px]`): conteúdo à
esquerda, painel de cenário fixo (`sticky`) à direita. Em telas pequenas o
painel vira um `Sheet` aberto pelo botão "Simular" no cabeçalho (ver
`.claude/docs/frontend/responsive.md`).

Cabeçalho: seletor de horizonte (3 / 6 / 12 meses) num `SegmentedControl`.

1. **Avisos de confiança** — tarja âmbar quando o histórico tem menos de 3 meses
   **ou** quando nenhuma receita recorrente foi detectada. O segundo caso é o
   mais importante: sem receita a projeção só enxerga saídas e o gráfico
   despenca; sem o aviso, o usuário lê isso como "vou quebrar" em vez de "falta
   informação".
2. **Veredito do horizonte** — "80% de chance de fechar os 6 meses sempre no
   positivo", com o pior p10 e o saldo de hoje ao lado.
3. **Gráfico de leque** — o elemento central.
4. **Card de resultado** — só aparece depois de simular um cenário.
5. **Tabela mês a mês** — passa a refletir o cenário quando há um.
6. **Card de premissas** — recolhido por padrão.

## Gráfico de leque

`ComposedChart` do recharts com duas `Area` de faixa (`dataKey` recebe o par
`[min, max]`), uma `Line` no p50, `ReferenceLine` em zero e outra tracejada na
reserva mínima. O primeiro ponto da série é "hoje", com o saldo inicial, para a
curva partir de onde o usuário está.

**Cores** (de `lib/tokens.ts`, nunca literais):

- A banda usa **uma única matiz** (`FINANCE.income`) em opacidades crescentes
  para dentro — 0,12 no p10–p90 e 0,22 no p25–p75. É uma codificação
  *sequencial* de incerteza, não categorias, e é por isso que não usa duas cores.
- A curva do cenário entra em `PALETTE.violet`, tracejada. O par
  esmeralda ↔ violeta foi validado com o script da skill `dataviz`: ΔE 26,1
  (deutan) e 34,7 (visão normal), bem acima do piso. O tracejado é a codificação
  secundária.
- Zero em `FINANCE.expense`; a reserva em `--muted-foreground` tracejada.

O tooltip mostra o valor provável, o do cenário, a faixa provável, o pessimista
e o risco de negativar — os números que a banda não consegue dizer sozinha.

## Tabela mês a mês

Mês, receita, saídas, saldo provável e uma mini-barra de risco com o percentual.
Meses com `probNegative > 25%` ganham fundo destacado. Cada linha expande
mostrando a composição: fixos, variáveis, já lançado no futuro, cenário, e os
extremos p10/p90.

## Painel de cenário

- **Campo de texto livre** no topo: "O que você está pensando em comprar?" →
  `POST /forecast/parse`. **Só é renderizado quando `useLlmHealth()` reporta IA
  disponível.**
- A resposta da IA **nunca é aplicada direto**: ela pré-preenche o formulário, o
  `interpretation` aparece como "entendi assim: … — confira os campos abaixo
  antes de adicionar", e o usuário confirma clicando em "Adicionar e simular".
- **Formulário** (a via principal, sempre presente): o quê, valor, juros ao mês,
  parcelas (1/2/3/6/10/12) e categoria.
- **Eventos empilhados**, cada um removível — dá para testar "comprar o notebook
  **e** cortar o streaming".

## Card de resultado

Veredito grande com a cor de `VERDICT_HEX`, a explicação determinística vinda do
backend, e os três acionáveis como *chips* clicáveis que reconfiguram o cenário
e re-simulam: "Teto seguro: R$ 5.800", "Em 12x fica tranquilo", "Melhor começar
em 2026-12".

Cada chip só aparece quando difere do que já está simulado — sugerir "em 10x"
para quem já pediu 10x é ruído.

Os acionáveis vêm de `POST /forecast/afford`, que só é chamado quando o cenário
tem **exatamente uma** compra parcelada: os acionáveis são sobre ela, e não
fazem sentido com vários eventos empilhados.

## Card no Home

`ForecastCard` em `app/src/pages/Home.tsx`, lado a lado com o card do check-up:
saldo previsto para o fim do mês corrente (p50), a chance de fechar positivo e a
faixa provável. Usa `useCashflow` com `horizonMonths: 1`.

## Camada de dados

`api.forecast.*` e `api.settings.*` em `lib/api.ts`. Chaves:

```ts
forecast: { all, cashflow(params) }
settings: { all }
```

Hooks: `useCashflow` (`staleTime` de 5 min), `useSimulate`, `useAfford`,
`useParseScenario` (os três `useMutation`), `useSettings` e `useUpdateSettings`.

A projeção só muda quando mudam transações, contas ou orçamentos — por isso
`keys.forecast.all` é invalidada junto com `keys.dashboard.all` e
`keys.budgets.all` nas mutações dessas entidades.
