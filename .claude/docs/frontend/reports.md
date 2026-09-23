---
title: Página /reports — Check-up mensal
area: frontend
updated: 2026-09-23
---

## Visão geral

Rota `/reports`, item "Check-up" na sidebar (ícone `FileText`). Um relatório por
mês, sobre todas as transações reais (contas sandbox ficam fora).

Arquivo: `app/src/pages/Reports/index.tsx` (lazy em `App.tsx`).
Domínio: `.claude/docs/domain/monthly-report.md`.

**Nenhum número exibido vem do campo `narrative`** — todos saem de
`report.metrics`.

## Cabeçalho

Navegação por mês (mesmo padrão de Transações) e botão "Regerar".

Sem navegação, a página abre em `GET /reports/monthly/current` — o relatório do
mês anterior ao atual, gerado na hora se não existir. Esse fallback é o que
torna o agendador uma conveniência, não um requisito. Navegar para outro mês
dispara `POST /monthly/generate` e passa a ler aquele relatório por id.

## Layout, na ordem em que se lê

1. **Aviso de mês parcial** — quando `metrics.period.partial`, uma tarja âmbar
   diz que a comparação com o mês anterior está enviesada.
2. **Veredito** — uma linha grande: "Você fechou agosto com **R$ 7.204,10**
   positivos", em `FINANCE.income` / `FINANCE.expense`. Abaixo, 4 tiles (gasto
   total, receita, resultado, taxa de poupança), cada um com a seta de variação
   contra o mês anterior. A seta é colorida pela **direção desejada**, não pelo
   sinal: gasto caindo é verde, receita caindo é vermelha. `deltaPct: null` vira
   "sem base de comparação".
3. **Narrativa** — card com o texto (max-width ~65ch) e as sugestões acionáveis,
   com rodapé "Texto gerado por IA a partir dos números acima · <modelo>".
   Quando `GENERATED` ou `NARRATION_FAILED`, vira um card tracejado com o motivo
   e o botão "Gerar texto" (desabilitado se `aiAvailable: false`). O caso
   rejeitado diz explicitamente que os números acima continuam corretos.
4. **Insights** — grade de cards, borda tingida pela severidade. Os que têm
   `categoryId` são clicáveis e navegam para `/transactions` já filtrado por
   categoria e período.
5. **50/30/20** — duas barras empilhadas, realizado sobre meta (esta em 45% de
   opacidade), mais uma legenda com valor e desvio em pp.
6. **Orçamentos** — tabela planejado vs. realizado, barra de progresso por linha
   colorida pelo status. Ordenada por urgência: `over`, `missing`, `under`,
   `on_track`.
7. **Anomalias** — por linha: categoria, valor atual vs. mediana, sparkline dos
   6 meses anteriores + o mês atual na ponta com a mediana como linha de
   referência tracejada, e as 3 maiores transações com link "Ver todas".
8. **Estabelecimentos novos** e **Cobranças recorrentes** (esta só quando
   `metrics.subscriptions` não é `null`).

## Estado vazio

Mês sem nenhum movimento mostra o estado vazio com o nome do mês, em vez de um
relatório de zeros (ver `.claude/docs/frontend/states.md`).

## Cores dos gráficos

Sem cor literal: tudo sai de `lib/tokens.ts`. O trio do 50/30/20 é
`BUDGET_TYPE_HEX` (âmbar / violeta / esmeralda), o mesmo já usado na página de
Orçamentos.

A paleta foi validada com o script da skill `dataviz`: separação para daltonismo
e contraste normal passam com folga (pior par ΔE 26,1 deutan / 34,7 normal). O
contraste contra a superfície clara fica abaixo de 3:1, o que **obriga rótulo
visível** — por isso cada faixa da barra empilhada carrega o percentual direto
(quando há espaço) além da legenda, e os segmentos são separados por um vão de
2px (`gap-0.5`).

A banda de luminosidade do tema escuro é a única checagem que não passa, porque
esses são os tokens de marca do projeto, usados de forma consistente em todas as
telas — trocá-los aqui quebraria a consistência visual para atender a paleta de
referência da skill.

## Card no Home

`CheckupCard` em `app/src/pages/Home.tsx`: veredito em uma linha, os 2 insights
mais severos e link para `/reports`. Consome o mesmo `useCurrentReport`, então
não custa uma requisição extra. Some quando não há relatório ou quando o mês não
teve movimento.

## Camada de dados

`api.reports.*` em `lib/api.ts`. Chaves em `lib/queries.ts`:

```ts
reports: { all, list(), detail(id), current() }
```

Hooks: `useCurrentReport` (`staleTime` de 5 min e `retry: false` — a geração sob
demanda pode levar segundos e não deve ser repetida à toa), `useReport`,
`useReportList`, `useGenerateReport` (usa `toast.promise` do `sonner`) e
`useNarrateReport`.
