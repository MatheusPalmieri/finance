---
title: Responsividade e navegação mobile
area: frontend
updated: 2026-06-24
---

## Visão geral

Layout mobile-first. O breakpoint divisor é o `lg` (1024px) do Tailwind: abaixo
dele a navegação vira um drawer; a partir dele, a sidebar fixa colapsável.

## Navegação

A fonte única dos itens fica em `app/src/components/layout/nav.ts`
(`navItems` + `isRouteActive`), consumida pelos dois modos:

| Componente | Visibilidade | Papel |
|------------|--------------|-------|
| `Sidebar.tsx` | `hidden lg:flex` | sidebar fixa colapsável (desktop) |
| `MobileTopbar.tsx` | `lg:hidden` | header fixo com logo, toggle de tema e drawer (`Sheet`) |

`AppLayout` empilha `MobileTopbar` acima do conteúdo numa coluna flex; a sidebar
fica ao lado. O drawer (`Sheet side="left"`) fecha no clique do link
(`onClick={() => setOpen(false)}`) — sem `useEffect`/`setState` em efeito, que o
React Compiler sinaliza.

## Espaçamento

`AppLayout` usa padding escalonado: `px-4 py-6 sm:px-6 lg:px-8 lg:py-8`.

## Touch targets

Alvos de toque mínimos de **44px** no mobile, reduzidos no desktop:

- Botões de ação (editar/excluir) em linhas e cards: `size-9 lg:size-7`.
- Ícones acompanham: `size={15}` com `lg:size-3.5`.
- Swatches do seletor de cor: `size-9 sm:size-7`.
- Setas de navegação de mês (Home): `size-9 sm:size-7`.

## Ações sempre visíveis no toque

O padrão "revelar no hover" não funciona em telas de toque. As ações de
linha/card usam:

```
transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100
```

→ sempre visíveis no mobile; reveladas no hover apenas no desktop (`lg`).

## Tabelas

A tabela de Investimentos (7 colunas) rola horizontalmente no mobile — o
componente `ui/table.tsx` já envolve em container `overflow-x-auto`.
