---
title: Performance do frontend
area: frontend
updated: 2026-06-08
---

## Visão geral

Otimizações de performance e uso de memória aplicadas ao `app/` (React 19 + Vite 8),
seguindo as boas práticas da Vercel para React. O foco é reduzir o JS baixado no
primeiro carregamento, melhorar o cache entre deploys e cortar re-renders
desnecessários.

## Code-splitting

- **Rotas** (`app/src/App.tsx`): cada página é `lazy()` + `Suspense` no `AppLayout`.
- **Abas do Dashboard** (`app/src/pages/Dashboard/index.tsx`): cada aba
  (`OverviewTab`, `MessagingTab`, `RevenueTab`, `PerformanceTab`) é `lazy()`.
  Só a aba ativa baixa seu código e o `mock.ts` que consome. Fallback de
  `Loader2` dentro de um `Suspense` que envolve as abas.

## Split de vendor (Vite)

`app/vite.config.ts` define `build.rollupOptions.output.manualChunks` para isolar
libs estáveis em chunks de cache longo (mudam pouco entre deploys):

| Chunk | Conteúdo |
|-------|----------|
| `react-vendor` | `react`, `react-dom`, `react-router`, `scheduler` |
| `query` | `@tanstack/react-query` |
| `recharts` | `recharts` + libs `d3-*` |

Resultado: o entry `index` caiu de ~391 KB (124 KB gz) para ~101 KB (32 KB gz).
O `recharts` (~426 KB) só é baixado nas rotas que usam gráficos (Funnel e
Dashboard), nunca em Home/Clients.

## React Compiler

Ativo via `@vitejs/plugin-react` v6 + `@rolldown/plugin-babel` em
`app/vite.config.ts`:

```ts
plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()]
```

Peers: `babel-plugin-react-compiler`, `@rolldown/plugin-babel`, `@babel/core`
(devDependencies). O compiler memoiza componentes/hooks automaticamente —
injeta `react/compiler-runtime` (`_c(N)`) em cada componente. Isso torna
`useMemo`/`useCallback`/`React.memo` manuais em grande parte redundantes (os
existentes continuam válidos e são tratados sem conflito pelo compiler).

Trade-off: o JS por chunk cresce um pouco (código de memoização) e o build fica
mais lento (passe do Babel). Ex.: `Clients` 150→168 KB, `Home` 5.5→7.3 KB.

> Aviso de lint conhecido em `PhaseModal.tsx`: o `watch()` do react-hook-form
> faz o compiler pular aquele componente ("Compilation Skipped"). É seguro.

## React Query

- `useClients` (`app/src/lib/queries.ts`) usa
  `placeholderData: keepPreviousData`. Ao paginar/filtrar, os dados anteriores
  permanecem visíveis enquanto a próxima página carrega — sem flash de skeleton
  nem remount da tabela.
- A `ClientsTable` recebe `isFetching` e atenua a tabela (`opacity-60`) durante o
  refetch em background, dando feedback sem voltar ao skeleton.

## Re-render

- `ClientRow` (`app/src/pages/Clients/ClientsTable.tsx`) é um componente
  `memo()`. Como os handlers vêm de `setState` (referência estável) e o objeto
  `client` só muda quando os dados mudam, alterar estado do pai (abrir um modal,
  paginar) não re-renderiza todas as linhas.
- O `Funnel` (`app/src/pages/Funnel.tsx`) já usa `useMemo` para `stages`,
  `distributionData` e `timeline`.

## Dados mock determinísticos

`app/src/pages/Dashboard/mock.ts` gera os dados com um PRNG de seed fixa
(mulberry32) em nível de módulo — calculado uma única vez no carregamento do
chunk, estável entre renders.

## Recomendações futuras (não aplicadas)

- **Lint pré-existente**: `button.tsx` quebra `react-refresh/only-export-components`
  (exporta `buttonVariants` junto do componente).
</content>
</invoke>
