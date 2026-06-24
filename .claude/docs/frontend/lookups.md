---
title: Frontend — CRUDs de cadastro (Categorias, Formas de pagamento, Bancos)
area: frontend
updated: 2026-06-23
---

## Visão geral

Três páginas de CRUD estruturalmente idênticas (nome + cor), todas construídas sobre um único componente genérico para evitar duplicação.

| Rota | Página | Hooks (em `lib/queries.ts`) |
|------|--------|------------------------------|
| `/categories` | `pages/Categories/index.tsx` | `useCategories`, `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory` |
| `/payment-methods` | `pages/PaymentMethods/index.tsx` | `usePaymentMethods`, `useCreatePaymentMethod`, `useUpdatePaymentMethod`, `useDeletePaymentMethod` |
| `/banks` | `pages/Banks/index.tsx` | `useBanks`, `useCreateBank`, `useUpdateBank`, `useDeleteBank` |

Rotas registradas em `App.tsx` (lazy) e itens de navegação na `components/layout/Sidebar.tsx`.

## Componente genérico

`components/crud/ColorEntityCrud.tsx` é genérico sobre `T extends ColorEntity` (`{ id, name, color }`). Recebe via props os textos (título, substantivo, gênero gramatical para concordância, placeholder, ícone de estado vazio) e os 4 hooks (`useList`, `useCreate`, `useUpdate`, `useDelete`).

Cada página é um wrapper fino que apenas passa os hooks e os textos. Para criar um novo módulo desse tipo:

1. Crie tabela + rota no `api/` (ver `.claude/docs/api/lookups.md`).
2. Adicione tipo em `types/finance.ts`, métodos em `lib/api.ts` e os 4 hooks em `lib/queries.ts`.
3. Crie `pages/<Nome>/index.tsx` renderizando `<ColorEntityCrud ... />`.
4. Registre a rota em `App.tsx` e o item na `Sidebar.tsx`.

## UI

- **Listagem**: grid de cards (1/2/3 colunas) com bolinha de cor, barra lateral colorida e ações de editar/excluir no hover (com `aria-label`).
- **Criar/Editar**: `FormModal` (`react-hook-form` + `zod`) com campo de nome e seletor de cor — 12 presets + input `type="color"` para cor personalizada.
- **Excluir**: `AlertDialog` de confirmação. Delete é permanente (hard delete).
- Estados de carregamento via `Skeleton`; estado vazio com CTA.
