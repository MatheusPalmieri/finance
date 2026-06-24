---
title: Estados de UI (loading, erro, vazio, sucesso)
area: frontend
updated: 2026-06-24
---

## Visão geral

Toda página de listagem cobre os quatro estados de uma query. O estado de erro
foi padronizado em um componente compartilhado.

## Componente de erro

`app/src/components/ui/error-state.tsx` → `<ErrorState message? onRetry? />`.
Mostra ícone, mensagem e botão "Tentar novamente". O `onRetry` recebe o `refetch`
da query.

## Padrão por página

A ordem das ramificações é sempre: **loading → erro → vazio → conteúdo**.

```tsx
const { data, isLoading, isError, refetch } = useX()
...
{isLoading ? (
  <Skeleton... />
) : isError ? (
  <ErrorState message="..." onRetry={() => refetch()} />
) : empty ? (
  <EmptyState... />
) : (
  <Content... />
)}
```

Páginas cobertas: Home (dashboard), Transações, Contas, Orçamentos, Investimentos
e o CRUD genérico `ColorEntityCrud` (Categorias / Formas de pagamento / Bancos).

## Loading

Skeletons (`ui/skeleton.tsx`) com o mesmo formato do conteúdo final — grids de
cards, linhas de lista ou blocos de gráfico, conforme a página.

## Sucesso

Feedback via toast (`sonner`) disparado nos `onSuccess`/`onError` das mutations
em `lib/queries.ts`. Mutações pendentes desabilitam o submit do `FormModal`
(`isPending`).
