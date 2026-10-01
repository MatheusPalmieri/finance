---
title: Ajustes — dialog estilo macOS
area: frontend
updated: 2026-10-01
---

## Visão geral

Telas de configuração que não são uso diário saíram da sidebar e moram num
dialog de **Ajustes** inspirado nos Ajustes do Sistema do macOS: janela com
~80% da tela, busca e lista de seções à esquerda, conteúdo à direita.
A sidebar ficou só com o que se usa no dia a dia (Início, Transações,
Investimentos, Orçamento, Projeção, Check-up).

## Seções

| id (`?settings=`) | Label | Conteúdo |
|---|---|---|
| `appearance` (padrão) | Aparência | `components/settings/AppearanceSettings.tsx` — Claro / Escuro / Automático (`system`) |
| `open-finance` | Open Finance | `pages/OpenFinance` (ver `frontend/open-finance.md`) |
| `rules` | Classificação | `pages/Rules` (ver `frontend/rules.md`) |
| `categories` | Categorias | `pages/Categories` (ver `frontend/lookups.md`) |

Fonte única: `components/settings/sections.ts` (`settingsSections`). Cada seção
tem ícone, cor do quadradinho (de `PALETTE`), `keywords` para a busca e o
componente (lazy). Lista única, mesmo espaçamento entre todos os itens (sem
blocos separados por grupo).

## Abrir e fechar

- Estado na URL: parâmetro **`?settings=<id>`** (`useSettings()` em
  `components/settings/useSettings.ts`). Funciona em qualquer rota e sobrevive a
  reload. Id inválido cai em `appearance`.
- `open(id?)` empilha no histórico (o voltar do navegador fecha); `select(id)`
  troca de seção com `replace`; `close()` remove o parâmetro.
- `settingsHref(id)` monta o link — usado no estado vazio de Transações.
- Gatilhos: botão **Ajustes** no rodapé da sidebar, botão de engrenagem na
  `MobileTopbar` e atalho **`,`** (sem modificador, ignorado em campos
  editáveis — `lib/keyboard.ts`).
- Rotas antigas `/open-finance`, `/rules` e `/categories` redirecionam para
  `/?settings=<id>` (`App.tsx`).
- `usePageTitle` usa o label da seção aberta no título da aba.

## Janela (`components/settings/SettingsDialog.tsx`)

- `DialogContent` sem o X padrão; `md:w-[80vw] md:h-[80dvh]`, cantos
  `rounded-2xl`. No mobile ocupa a tela inteira.
- Cabeçalho da barra lateral: título **"Ajustes"** (`DialogTitle`) e botão X
  (`Button` ghost, padrão do app). Sem semáforo do macOS nem maximizar — o
  usuário pediu que essa parte não imitasse o Mac.
- **Busca**: filtra por label e keywords, sem acento e sem caixa.
- **Mobile**: lista → detalhe, como no iOS; botão "‹ Ajustes" volta. Deep-link
  direto numa seção que não seja a padrão já abre no detalhe.
- O conteúdo das páginas é renderizado como está (com seus próprios títulos);
  modais delas (FormModal, AlertDialog) abrem aninhados sobre os Ajustes.

## Tema

O botão de alternar tema saiu da sidebar e da topbar mobile. O tema agora é
escolhido em Aparência; o atalho **`D`** (no `ThemeProvider`) continua valendo.
