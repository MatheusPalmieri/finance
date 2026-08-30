---
title: Frontend — CRUD de cadastro (Categorias)
area: frontend
updated: 2026-07-01
---

## Visão geral

Uma página de CRUD (nome + cor), construída sobre um componente genérico pensado para múltiplos módulos desse tipo.

| Rota | Página | Hooks (em `lib/queries.ts`) |
|------|--------|------------------------------|
| `/categories` | `pages/Categories/index.tsx` | `useCategories`, `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory` |

Rota registrada em `App.tsx` (lazy) e item de navegação na `components/layout/Sidebar.tsx`.

> **Removidos em 2026-07-01:**
> - **Bancos** (`/banks`, `pages/Banks/index.tsx`, `useBanks`/`useCreateBank`/`useUpdateBank`/`useDeleteBank`) — apagado por completo. Era um cadastro avulso sem nenhuma ligação real com o resto do sistema (nunca teve FK de `accounts` ou `transactions` apontando pra ele).
> - **Formas de pagamento** (`/payment-methods`, `pages/PaymentMethods/index.tsx`, os 4 hooks `usePaymentMethods` etc.) — deixou de ser CRUD, virou lista fixa de 6 valores (`PAYMENT_METHOD_ORDER`/`PAYMENT_METHOD_LABELS`/`PAYMENT_METHOD_HEX` em `types/finance.ts`), usada diretamente nos `Select` de `Transactions/index.tsx` e `Transactions/ImportModal.tsx`. Ver `.claude/docs/domain/transaction.md`.

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
