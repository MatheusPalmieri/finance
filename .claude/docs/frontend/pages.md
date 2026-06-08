---
title: Frontend — Páginas e estrutura
area: frontend
updated: 2026-06-08
---

## Visão geral

SPA com React Router DOM v7 usando o padrão moderno `createBrowserRouter` + `RouterProvider`. Todas as rotas ficam sob `AppLayout` (sidebar fixa + `<Outlet />`). Código em inglês, comentários em pt-BR.

## Configuração do roteador (`App.tsx`)

```tsx
const router = createBrowserRouter([
  {
    element: <AppLayout />,          // layout pai com <Outlet />
    children: [
      { index: true, element: <Home /> },
      { path: "clients",   element: <Clients /> },
      { path: "funnel",    element: <Funnel /> },
      { path: "reports",   element: <Reports /> },
      { path: "dashboard", element: <Dashboard /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
```

Vantagens sobre o padrão JSX `<BrowserRouter>/<Routes>/<Route>`:
- Habilita as Data APIs do RR v7: `loader`, `action`, `errorElement` por rota
- Configuração declarativa em objetos — mais fácil de inspecionar e testar
- `index: true` para rota raiz (sem `path="/"`)
- Caminhos filhos sem barra inicial (`"clients"`, não `"/clients"`)

Stack de dados/formulários: **TanStack Query v5** (cache + mutations), **React Hook Form v7** + **Zod v4** (validação), **sonner** (toasts).

## Rotas

| Path | Componente | Status |
|------|-----------|--------|
| `/` | `pages/Home.tsx` | Real (últimos clientes via TQ) |
| `/clients` | `pages/Clients/index.tsx` | Funcional |
| `/funnel` | `pages/Funnel.tsx` | Mockado |
| `/reports` | `pages/Reports.tsx` | Mockado |
| `/dashboard` | `pages/Dashboard.tsx` | Mockado |

## Layout

- `components/layout/Sidebar.tsx` — `w-52`, cabeçalho com `border-b`, hover com `bg-muted`
- `components/layout/AppLayout.tsx` — `<main>` com `max-w-5xl` centralizado, padding `px-8 py-8`

## Setup global (`main.tsx`)

```tsx
<QueryClientProvider client={queryClient}>   // staleTime 30s, retry 1
  <ThemeProvider>
    <App />
    <Toaster richColors position="top-right" />  // sonner
  </ThemeProvider>
</QueryClientProvider>
```

## TanStack Query hooks (`lib/queries.ts`)

Todos os hooks invalidam `clientKeys.lists()` no `onSuccess` e disparam toast via sonner.

| Hook | Tipo | Descrição |
|------|------|-----------|
| `useClients(params)` | `useQuery` | Lista paginada com filtros |
| `useCreateClient()` | `useMutation` | POST /clients |
| `useUpdateClient()` | `useMutation` | PUT /clients/:id |
| `useUpdateClientStatus()` | `useMutation` | PATCH /clients/:id/status |
| `useUpdateClientResponsible()` | `useMutation` | PATCH /clients/:id/responsible |
| `useDeleteClient()` | `useMutation` | DELETE /clients/:id |

Cache keys centralizados em `clientKeys` (factory pattern do TQ).

## Zod schemas (`lib/schemas.ts`)

| Schema | Uso |
|--------|-----|
| `clientSchema` / `ClientFormValues` | Create + Edit modais |
| `statusSchema` / `StatusFormValues` | StatusModal |
| `responsibleSchema` / `ResponsibleFormValues` | ResponsibleModal |

## Página de Clientes (`pages/Clients/`)

### Componentes

| Arquivo | Função |
|---------|--------|
| `index.tsx` | Orquestra filtros, debounce de busca, modais |
| `ClientsTable.tsx` | Tabela com skeleton, empty state, DropdownMenu por linha |
| `ClientForm.tsx` | Campos RHF controlados (nome, DDD, telefone, cidade, status) |
| `CreateClientModal.tsx` | Modal criação — RHF + Zod + `useCreateClient` |
| `EditClientModal.tsx` | Modal edição — RHF + Zod + `useUpdateClient` |
| `StatusModal.tsx` | Modal status — RHF + `useUpdateClientStatus` |
| `ResponsibleModal.tsx` | Modal responsável — RHF + `useUpdateClientResponsible` |
| `DeleteDialog.tsx` | AlertDialog de confirmação — `useDeleteClient` |

### Fluxo de estado (`index.tsx`)

```
useClients(params)  ← TanStack Query (cache automático)
  ├── filtros: search (debounce 350ms), statusFilter, showDuplicates, page
  └── page reset: feito nos handlers handleSearchChange / handleStatusChange / handleDuplicatesToggle / handleClearFilters
```

Ao confirmar qualquer mutation, TQ invalida `clientKeys.lists()` — sem callbacks manuais de reload.

### Tabela (`ClientsTable.tsx`)

- **Skeleton**: 8 linhas de `<Skeleton />` enquanto `isLoading=true`
- **Empty state**: ícone `Users` + texto explicativo
- **Ações por linha**: `DropdownMenu` com Editar / Alterar status / Responsável / Excluir
- Coluna Nome: ícone `AlertTriangle` âmbar quando `hasDuplicate=true`
- Coluna Telefone: `(DDD) XXXX-XXXX` em `font-mono`
- Coluna Responsável: `—` se não cadastrado

### Toasts e confirmações

- Toasts `sonner` em todas as mutations (sucesso e erro)
- Exclusão via `AlertDialog` (sem `window.confirm`)
- Erros de formulário inline via `errors.field.message` (Zod)

## Client HTTP (`lib/api.ts`)

Thin wrapper sobre `fetch`. Lança `Error` com `body.message` em respostas não-2xx. Todos os endpoints expostos como `api.clients.*`. URL base via `VITE_API_URL` (`.env`).

## Tipos (`types/client.ts`)

- `ClientStatus` — union type com os 10 valores do enum
- `CLIENT_STATUS_LABELS` — mapa status → label em pt-BR
- `CLIENT_STATUS_COLORS` — mapa status → variante de Badge
- `Client` — interface completa incluindo `hasDuplicate?`
- `ClientsResponse` — wrapper com `data[]` + `meta`

## Variáveis de ambiente

| Variável | Valor padrão | Descrição |
|----------|-------------|-----------|
| `VITE_API_URL` | `http://localhost:3000` | URL base da API |
