---
title: Frontend — Páginas e estrutura
area: frontend
updated: 2026-06-08
---

## Visão geral

SPA com React Router DOM v7 usando o padrão moderno `createBrowserRouter` + `RouterProvider`. Todas as rotas ficam sob `AppLayout` (sidebar fixa + `<Outlet />`). Código em inglês, comentários em pt-BR.

## Configuração do roteador (`App.tsx`)

**Code-splitting por rota**: cada página é importada com `React.lazy()` (dynamic `import()`), gerando um chunk separado por rota. Como as páginas usam export nomeado, o import é mapeado para `default`:

```tsx
const Home = lazy(() =>
  import("@/pages/Home").then((m) => ({ default: m.Home }))
)
// idem Clients, Funnel, Dashboard

const router = createBrowserRouter([
  {
    element: <AppLayout />,          // layout pai com <Outlet /> dentro de <Suspense>
    children: [
      { index: true, element: <Home /> },
      { path: "clients",   element: <Clients /> },
      { path: "funnel",    element: <Funnel /> },
      { path: "dashboard", element: <Dashboard /> },
      // /reports foi unificado ao /dashboard
      { path: "reports",   element: <Navigate to="/dashboard" replace /> },
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

### Impacto do code-splitting no bundle

O `recharts` (~108 kB gzip, usado por Funil/Dashboard) saiu do bundle inicial e só baixa ao acessar essas rotas. Bundle inicial caiu de **328 kB → 124 kB gzip** e o warning de chunk > 500 kB do Vite sumiu.

| Chunk | gzip | Carrega em |
|-------|------|-----------|
| `index` (React, Router, layout) | ~124 kB | sempre |
| `Home` | ~2 kB | `/` |
| `Funnel` | ~8 kB | `/funnel` |
| `Dashboard` | ~19 kB | `/dashboard` |
| `Clients` | ~43 kB | `/clients` |
| `AreaChart` (recharts) | ~108 kB | junto de Funil/Dashboard |

Stack de dados/formulários: **TanStack Query v5** (cache + mutations), **React Hook Form v7** + **Zod v4** (validação), **sonner** (toasts).

## Rotas

| Path | Componente | Status |
|------|-----------|--------|
| `/` | `pages/Home.tsx` | **Dashboard resumo** (KPIs reais + pipeline + recentes) |
| `/clients` | `pages/Clients/index.tsx` | Funcional |
| `/funnel` | `pages/Funnel.tsx` | **Dashboard real** (recharts + `GET /clients/stats`) |
| `/dashboard` | `pages/Dashboard/index.tsx` | **Painel operacional** (recharts, mockado em 4 abas) |
| `/reports` | — | Redireciona p/ `/dashboard` (`<Navigate replace>`) |

> As páginas antigas `Reports.tsx` e `Dashboard.tsx` (mocks simples) foram **removidas** e unificadas no novo diretório `pages/Dashboard/`.

## Layout

- `components/layout/Sidebar.tsx` — colapsável, usa os tokens `sidebar-*` (`bg-sidebar`, `border-sidebar-border`, etc). Largura `w-60` (expandida) ↔ `w-17` (colapsada) com `transition-[width]`.
  - **Colapso persistido**: estado `collapsed` salvo no `localStorage` (`sidebar-collapsed`); atalho de teclado **`B`** alterna (com guarda `isEditableTarget` para não disparar dentro de inputs). Quando colapsada, labels somem (`w-0 opacity-0`) e cada item ganha um **tooltip** à direita (radix `Tooltip`, `side="right"`).
  - **Logo** (`components/layout/Logo.tsx`): `LogoMark` é um SVG próprio — dente estilizado branco sobre quadrado arredondado com gradiente azul→ciano (`#3b82f6`→`#06b6d4`). `Logo` mostra o wordmark "Odonto Reativa / CRM" que colapsa junto com a sidebar.
  - **Indicador ativo deslizante**: um `<div>` absoluto (`bg-sidebar-primary`) animado com `translateY(activeIndex * ITEM_HEIGHT)` + `transition-all` (easing `cubic-bezier(0.22,1,0.36,1)`), que escorrega entre os itens. `activeIndex` derivado de `useLocation().pathname` via `getActiveIndex()` (match exato em `/`, `startsWith` no resto). Itens `h-10` (`ITEM_HEIGHT = 40`) num container `relative`.
  - **Micro-interações**: ícone com `group-hover:scale-110`, hover com `bg-sidebar-accent`.
  - **Rodapé** (`FooterButton` reutilizável): toggle de tema (Sun/Moon com cross-fade via `dark:` variants, hint `D`) + toggle de colapso (`PanelLeftClose`/`PanelLeftOpen`, hint `B`). Ambos viram ícone centralizado + tooltip quando colapsada.
- `components/layout/AppLayout.tsx` — `<main>` com `max-w-7xl` centralizado, padding `px-8 py-8`. O `<Outlet />` é envolvido por `<Suspense>` com fallback de loading (spinner `Loader2` centralizado em `h-[60vh]`) enquanto o chunk da rota lazy carrega.

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
| `useClientStats(params)` | `useQuery` | Métricas do funil (`period`, `city`) |
| `useClientCities()` | `useQuery` | Lista distinta de cidades (`GET /clients/cities`), `staleTime` 5min — alimenta o filtro de cidade |
| `useCreateClient()` | `useMutation` | POST /clients |
| `useUpdateClient()` | `useMutation` | PUT /clients/:id |
| `useUpdateClientPhase()` | `useMutation` | PATCH /clients/:id/phase |
| `useUpdateClientResponsible()` | `useMutation` | PATCH /clients/:id/responsible |
| `useDeleteClient()` | `useMutation` | DELETE /clients/:id |

Cache keys centralizados em `clientKeys` (factory pattern do TQ).

## Zod schemas (`lib/schemas.ts`)

| Schema | Uso |
|--------|-----|
| `clientSchema` / `ClientFormValues` | EditClientModal (campos gerais) |
| `createClientSchema` / `CreateClientFormValues` | CreateClientModal — estende `clientSchema` com `phase` + `closeReason` + `messageSent` (refine: motivo obrigatório se `phase=CLOSED`) |
| `phaseSchema` / `PhaseFormValues` | PhaseModal |
| `responsibleSchema` / `ResponsibleFormValues` | ResponsibleModal |

## Página de Clientes (`pages/Clients/`)

### Componentes

| Arquivo | Função |
|---------|--------|
| `index.tsx` | Orquestra filtros, debounce de busca, modais |
| `ClientsTable.tsx` | Tabela com skeleton, empty state, DropdownMenu por linha. Linha clicável abre o `ClientDetailsModal` |
| `ClientDetailsModal.tsx` | Modal de leitura com todos os campos do cliente (contato, linha do tempo de fase, registro) + botões que abrem os mesmos diálogos de ação (Editar / Fase-motivo / Responsável / Excluir) |
| `ClientForm.tsx` | Campos RHF controlados (nome, DDD, telefone, cidade). Genérico sobre `T extends ClientFormValues` para servir Create e Edit |
| `CreateClientModal.tsx` | Modal criação — RHF + Zod + `useCreateClient`. Usa `ClientForm` + `PhaseReasonFields` (define fase/motivo já na criação) |
| `EditClientModal.tsx` | Modal edição — RHF + Zod + `useUpdateClient` (só campos gerais) |
| `PhaseModal.tsx` | Modal de fase — usa `PhaseReasonFields` (phase + closeReason condicional + checkbox messageSent) |
| `ResponsibleModal.tsx` | Modal responsável — RHF + `useUpdateClientResponsible` |

Componentes de formulário compartilhados em `components/forms/`:

| Arquivo | Função |
|---------|--------|
| `PhoneFields.tsx` | Par DDD + Telefone (só dígitos), genérico sobre o form |
| `PhaseReasonFields.tsx` | Fase + motivo de fechamento (condicional em `CLOSED`) + checkbox "mensagem enviada" (condicional em `PROSPECTING`), genérico. Reutilizado por CreateClientModal e PhaseModal |
| `DeleteDialog.tsx` | AlertDialog de confirmação — `useDeleteClient` |

### Fluxo de estado (`index.tsx`)

```
useClients(params)  ← TanStack Query (cache automático)
  ├── filtros inline:   search (debounce 350ms), phaseFilter, cityFilter, showDuplicates
  ├── filtros avançados: closeReasonFilter, contactedFilter, responsibleFilter, createdWithin (no popover "Filtros")
  ├── page reset: todo handler de filtro chama setPage(1)
  └── handleClearFilters: zera todos os filtros de uma vez (botão "Limpar", visível só com filtro ativo)
```

**Barra de filtros** — busca, **Fase** e **Cidade** (selects inline), botão **Filtros** (`Popover`) e toggle **Duplicatas**:

- O `Popover` (`components/ui/popover.tsx`, padrão `radix-ui`) agrupa os filtros avançados: **Motivo de fechamento** (`closeReason`), **Contato** (`messageSentAt` not null / null), **Responsável** (tem `responsiblePhoneNumber` / não), **Criado em** (janela relativa `7d`/`30d`/`90d`).
- O botão "Filtros" exibe um `Badge` com a contagem de filtros avançados ativos (`advancedCount`).
- Tipos de filtro em `lib/api.ts`: `ContactedFilter`, `ResponsibleFilter`, `CreatedWithin`. O `api.clients.list()` traduz `yes/no` → `true/false` e omite `all`/vazios da query string.

Ao confirmar qualquer mutation, TQ invalida `clientKeys.lists()` — sem callbacks manuais de reload.

### Tabela (`ClientsTable.tsx`)

- **Skeleton**: 8 linhas de `<Skeleton />` enquanto `isLoading=true`
- **Empty state**: ícone `Users` + texto explicativo
- **Linha clicável**: clique (ou Enter/Espaço) abre `ClientDetailsModal`; a célula de ações faz `stopPropagation` para não disparar o detalhe ao usar o dropdown
- **Ações por linha**: `DropdownMenu` com Editar / Alterar fase/motivo / Responsável / Excluir
- **Detalhe → ação**: os botões do `ClientDetailsModal` fecham o detalhe e abrem o diálogo de ação correspondente (`openFromDetails` no `index.tsx`), reusando exatamente os mesmos modais da tabela
- Coluna Nome: ícone `AlertTriangle` âmbar quando `hasDuplicate=true`
- Coluna Telefone: `(DDD) XXXX-XXXX` em `font-mono`
- Coluna Responsável: `—` se não cadastrado
- **Colunas**: Nome, Telefone, Cidade, Fase, Motivo, Responsável + ações
- **Coluna Fase**: `<PhaseBadge phaseOnly />` — sempre a `phase`, sem embutir o motivo
- **Coluna Motivo**: `<CloseReasonBadge />` com o `closeReason`; `—` quando ausente (clientes não fechados)

### Toasts e confirmações

- Toasts `sonner` em todas as mutations (sucesso e erro)
- Exclusão via `AlertDialog` (sem `window.confirm`)
- Erros de formulário inline via `errors.field.message` (Zod)

## Primitivos de gráfico compartilhados

A linguagem visual de dados (usada pelo Funil e pelo Dashboard) está dividida em dois arquivos para não misturar exports de componentes e de valores (regra `react-refresh/only-export-components`):

**`components/charts.tsx`** (apenas componentes):
- `StatCard` — card de KPI (label, value, `delta`/`trend`, ícone com bg do accent, `delay` de animação)
- `ChartCard` — wrapper de gráfico (título, subtítulo, `action` opcional, `delay`)
- `ChartTooltip` — tooltip custom com tokens (`bg-popover`); aceita `suffix` ou `format(v)`
- `SegmentedControl<T>` — grupo de botões com pílula ativa (abas e filtros de período)

**`lib/charts.ts`** (constantes e formatadores, sem JSX):
- `CHART_COLORS` / `CHART_PALETTE` — paleta hex
- `fmtBRL` / `fmtBRLk` / `fmtCompact` / `fmtNum` — formatadores pt-BR
- `axisTick` / `gridStroke` — estilo de eixos recharts com tokens do tema

> O Funil também consome esses primitivos (deixou de ter cópias locais de `StatCard`/`ChartCard`/`ChartTooltip` e usa `SegmentedControl` no filtro de período).

## Home (`pages/Home.tsx`)

Dashboard de resumo da base, alimentado por `useClientStats({ period: "all" })` (KPIs/pipeline) e `useClients({ page: 1, limit: 6 })` (recentes). Reaproveita `StatCard`/`ChartCard` de `components/charts.tsx`.

- **Saudação dinâmica**: "Bom dia/tarde/noite" conforme `new Date().getHours()`
- **4 KPIs**: total de leads, contatados (% da base), em negociação, taxa de conversão (ganhos/total)
- **Pipeline** (`PipelineBreakdown`): barra empilhada das 3 fases (cores de `CLIENT_PHASE_HEX`) + legenda com contagem/percentual; link para `/funnel`
- **Recentes**: lista dos 6 últimos leads (ordenados por `createdAt desc` no backend) com `PhaseBadge` e tempo relativo (`relativeTime` → "hoje"/"ontem"/"há Nd"); link para `/clients`
- Skeletons em ambos os blocos enquanto carrega

> `GET /clients` ordena por `createdAt desc` — necessário para "Recentes" e também aplica à listagem de Clientes (mais novos primeiro).

## Página de Funil (`pages/Funnel.tsx`)

Dashboard real do funil de vendas, alimentado por `GET /clients/stats` via `useClientStats`. Usa **recharts** (`^3`) para os gráficos e os primitivos de `components/charts.tsx`. Layout dentro do container `max-w-5xl` do `AppLayout`.

### Filtros (dinâmicos)

- **Período**: controle segmentado (`7d` / `30d` / `90d` / `Tudo`) — botões com pílula ativa (`bg-primary`)
- **Cidade**: `Select` populado por `data.cities` (lista global); `__all__` = todas
- **Atualizar**: botão `RefreshCw` que chama `refetch()` (gira enquanto `isFetching`)

Cada mudança de filtro re-busca via TanStack Query (nova `queryKey`).

### Composição

| Bloco | Gráfico recharts | Origem dos dados |
|-------|------------------|------------------|
| 4 KPIs | — | `total`, pipeline ativo, fechados, taxa de conversão |
| Funil de conversão | `FunnelChart` (aliased `FunnelSeries`) + lista de etapas com `% conversão` | etapas acumulativas derivadas de `statusCounts` (`FUNNEL_DEF`) |
| Distribuição por status | `PieChart` donut com total no centro | `statusCounts` (só > 0) |
| Leads ao longo do tempo | `AreaChart` com gradiente | `timeline` (dias vazios preenchidos no front por `buildTimeline`) |
| Top cidades | `BarChart` horizontal | `byCity` |

- **Funil acumulativo**: como cada cliente tem um único status, as etapas (`Base → Contatados → Negociando → Em trial → Fechado`) são supersets decrescentes, calculadas no front — não no banco.
- **Cores**: `CLIENT_STATUS_HEX` em `types/client.ts` é a fonte única das cores por status; o funil/áreas usam constantes locais (`FUNNEL_DEF`).
- **Estados**: `DashboardSkeleton` (loading), `EmptyState` (`total === 0`).
- **Motion**: cards entram com `animate-in fade-in slide-in-from-bottom-2` escalonados por `animationDelay`; recharts anima as séries (`animationDuration={700}`).
- **Tooltips** custom (`ChartTooltip` / `FunnelTooltip`) estilizados com tokens (`bg-popover`).

> ⚠️ recharts importa um `Funnel` que **colide** com o nome do componente da página — por isso o import é aliased para `FunnelSeries`. O recharts é pesado (~108 kB gzip) mas agora fica isolado em chunk próprio via lazy loading da rota (ver "Impacto do code-splitting no bundle").

## Painel operacional (`pages/Dashboard/`)

Hub de analytics que **unificou** as antigas `/dashboard` e `/reports`. Pensado para um CRM de **disparos (outbound) para vender SaaS**. Dados **mockados** de forma determinística (seed fixa em `mock.ts`, PRNG mulberry32) — estáveis entre renders. Organizado em **4 abas** via `SegmentedControl`.

| Arquivo | Conteúdo |
|---------|----------|
| `index.tsx` | Shell: cabeçalho, `SegmentedControl` de abas + filtro de período (só na aba Disparos) |
| `mock.ts` | Toda a massa de dados + KPIs derivados; exporta `Period` (`30d`/`90d`/`12m`) |
| `OverviewTab.tsx` | Visão geral |
| `MessagingTab.tsx` | Disparos (recebe `period`) |
| `RevenueTab.tsx` | Receita |
| `PerformanceTab.tsx` | Performance do time |

### Abas e gráficos (recharts)

- **Visão geral** — 6 KPIs (MRR, clientes, disparos, resposta, conversão, churn); `AreaChart` de MRR (12m); `PieChart` donut de clientes por plano; `ComposedChart` (novos/cancelados em barras + linha de conversão).
- **Disparos** — 4 KPIs; `LineChart` multi-série (enviadas/entregues/respondidas, fatiado por `period`); `BarChart` empilhado de status por canal; donut de volume por canal; **mapa de calor** (dia × horário) de taxa de resposta — grid de divs com alpha proporcional (`heatColor`).
- **Receita** — 6 KPIs (MRR, ARR, ticket, LTV, CAC, LTV/CAC); `AreaChart` empilhado (base + expansão); donut de aquisição; `BarChart` horizontal de receita por plano.
- **Performance** — 4 KPIs; `RadialBarChart` de meta do time; `BarChart` horizontal de conversões por SDR; tabela de ranking com mini-barra de meta; `BarChart` de clientes por cidade.

- **Período** (`30d`/`90d`/`12m`) afeta as séries diárias da aba Disparos (`dailyMessaging.slice`); receita é sempre mensal (12m).
- Mesma UI do Funil: cards `animate-in`, `ChartCard`/`StatCard`/`ChartTooltip` compartilhados, eixos com tokens, séries com `animationDuration={700}`.
- Eixos com valores em milhares usam `fmtCompact` (ex.: `15k`) para não cortar dígitos.

## Client HTTP (`lib/api.ts`)

Thin wrapper sobre `fetch`. Lança `Error` com `body.message` em respostas não-2xx. Todos os endpoints expostos como `api.clients.*`. URL base via `VITE_API_URL` (`.env`).

## Tipos (`types/client.ts`)

- `ClientPhase` — union type com 3 valores: `PROSPECTING | NEGOTIATING | CLOSED`
- `CloseReason` — union type com 7 valores (CLIENT, TRIAL, CUSTOM_TRIAL, PRICE_OBJECTION, NO_FIT, GHOST, UNREACHABLE)
- `CLIENT_PHASE_LABELS` — mapa phase → label em pt-BR
- `CLOSE_REASON_LABELS` — mapa closeReason → label em pt-BR
- `CLIENT_PHASE_HEX` — mapa phase → cor hex
- `CLOSE_REASON_HEX` — mapa closeReason → cor hex (fonte única dos gráficos do funil)
- `Client` — interface completa incluindo `phase`, `closeReason`, timestamps de transição, `hasDuplicate?`
- `ClientsResponse` — wrapper com `data[]` + `meta`

Em `lib/api.ts`: `StatsPeriod`, `StatsParams`, `ClientStats` (com `phaseCounts`, `closeReasonCounts`, `contacted`) + método `api.clients.stats(params)`.

## Variáveis de ambiente

| Variável | Valor padrão | Descrição |
|----------|-------------|-----------|
| `VITE_API_URL` | `http://localhost:3000` | URL base da API |
