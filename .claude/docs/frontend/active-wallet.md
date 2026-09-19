---
title: Frontend — Carteira ativa (escopo global)
area: frontend
updated: 2026-09-19
---

## Visão geral

A Carteira deixou de ser apenas um filtro local da tela de Transações e virou o **escopo global do app**. Um seletor fixo na navegação define a carteira ativa; enquanto ela estiver selecionada, as telas trazem só os dados dela e os novos registros nascem atribuídos a ela.

Estado `null` = **"Todas as carteiras"** (comportamento anterior, sem filtro).

## Peças

| Arquivo | Papel |
|---------|-------|
| `app/src/components/wallet-provider.tsx` | `WalletProvider` + hook `useActiveWallet()` — guarda `walletId: string \| null`, persistido em `localStorage` sob a chave `active-wallet-id` |
| `app/src/components/layout/WalletSwitcher.tsx` | Dropdown do seletor (lista as carteiras + "Todas as carteiras" + "Gerenciar carteiras") |
| `app/src/main.tsx` | `<WalletProvider>` envolve o `<App />`, dentro do `ThemeProvider` |

O `WalletProvider` fica **acima** do router, então a carteira ativa sobrevive à navegação entre rotas.

## Onde o seletor aparece

- **Sidebar (desktop)** — logo abaixo do cabeçalho com a logo, antes dos itens de navegação. Quando a sidebar está recolhida, mostra só a bolinha da cor da carteira, com tooltip.
- **Drawer mobile (`MobileTopbar`)** — mesma posição, abaixo do header do `Sheet`; selecionar "Gerenciar carteiras" fecha o drawer antes de navegar.

O item **"Carteiras"** foi **removido do `navItems`** (`components/layout/nav.ts`). A rota `/wallets` continua existindo e o CRUD é alcançado pela última opção do dropdown ("Gerenciar carteiras").

## O que a carteira ativa escopa

| Tela | Efeito |
|------|--------|
| Transações (`pages/Transactions/index.tsx`) | `walletId` entra nos params de `GET /transactions`. Trocar de carteira reseta `page` para 1 (ajuste feito no render, via `lastWalletId`, não em `useEffect`) |
| Nova transação (`TransactionModal`) | `defaultValues.walletId = activeWalletId` — o campo "Carteira" **saiu do formulário**; editar uma transação preserva a carteira que ela já tinha |
| Importação CSV (`ImportModal`) | Todas as linhas importadas recebem `walletId` da carteira ativa |
| Início (`pages/Home.tsx`) | `walletId` vai como query param de `GET /dashboard/summary` |

Não são escopados (permanecem globais): Contas, Categorias, Orçamentos e Open Finance.

## Carteira excluída

Se o `localStorage` guardar o id de uma carteira que não existe mais, o `WalletSwitcher` detecta (a lista carregada não contém o id) e volta para "Todas as carteiras" — evita filtrar por um id inválido e mostrar tudo vazio.

## Relacionados

- `.claude/docs/domain/wallet.md` — entidade
- `.claude/docs/api/transactions.md` — filtro `walletId`
- `.claude/docs/frontend/transactions-filters.md` — demais filtros da tela
