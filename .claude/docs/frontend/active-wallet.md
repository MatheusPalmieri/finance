---
title: Frontend — Carteira ativa (escopo global)
area: frontend
updated: 2026-09-19
---

## Visão geral

A Carteira deixou de ser apenas um filtro local da tela de Transações e virou o **escopo global do app**. Um seletor no rodapé da navegação define a carteira ativa; as telas trazem só os dados dela e os novos registros nascem atribuídos a ela.

**Há sempre uma carteira ativa** — não existe opção "todas". `walletId` só é `null` no caso limite em que nenhuma carteira foi cadastrada ainda.

## Peças

| Arquivo | Papel |
|---------|-------|
| `app/src/components/wallet-provider.tsx` | `WalletProvider` + hook `useActiveWallet()` — guarda a escolha em `localStorage` (chave `active-wallet-id`) e **deriva** a carteira ativa a partir da lista de `useWallets()` |
| `app/src/components/layout/WalletSwitcher.tsx` | Dropdown do seletor — lista as carteiras (`DropdownMenuRadioGroup`) + atalho "Gerenciar carteiras" |
| `app/src/main.tsx` | `<WalletProvider>` envolve o `<App />`, dentro do `ThemeProvider` |

O `WalletProvider` fica **acima** do router, então a carteira ativa sobrevive à navegação entre rotas.

## Onde o seletor aparece

- **Sidebar (desktop)** — no rodapé, empurrado para baixo por `mt-auto`, **acima do divider** do bloco tema/recolher. Quando a sidebar está recolhida, mostra só a bolinha da cor da carteira, com tooltip. O dropdown abre para cima (`side="top"`).
- **Drawer mobile (`MobileTopbar`)** — também no rodapé do `Sheet`, depois do `<nav>` e com `border-t`; selecionar "Gerenciar carteiras" fecha o drawer antes de navegar.

O item **"Carteiras"** foi **removido do `navItems`** (`components/layout/nav.ts`). A rota `/wallets` continua existindo e o CRUD é alcançado pela última opção do dropdown ("Gerenciar carteiras").

## O que a carteira ativa escopa

| Tela | Efeito |
|------|--------|
| Transações (`pages/Transactions/index.tsx`) | `walletId` entra nos params de `GET /transactions`. Trocar de carteira reseta `page` para 1 (ajuste feito no render, via `lastWalletId`, não em `useEffect`) |
| Nova transação (`TransactionModal`) | `defaultValues.walletId = activeWalletId` — o campo "Carteira" **saiu do formulário**; editar uma transação preserva a carteira que ela já tinha |
| Importação CSV (`ImportModal`) | Todas as linhas importadas recebem `walletId` da carteira ativa |
| Início (`pages/Home.tsx`) | `walletId` vai como query param de `GET /dashboard/summary` |

Não são escopados (permanecem globais): Contas, Categorias, Orçamentos e Open Finance.

## Seleção padrão e fallback

A carteira ativa é **derivada no render** (não em `useEffect`, para não existir nenhum instante sem carteira):

```
walletId = wallets
  ? (carteira salva ainda existe ? ela : primeira da lista)
  : carteira salva   // enquanto a lista carrega
```

Consequências:

- **Primeiro acesso** (sem nada em `localStorage`) → entra na primeira carteira da lista (ordenada por `name` na API).
- **Carteira ativa excluída** → a lista é invalidada pelo React Query e a derivação cai na próxima carteira disponível, sem passo manual.
- **Nenhuma carteira cadastrada** → `walletId` é `null`, o seletor mostra "Nenhuma carteira" e o dropdown exibe "Nenhuma carteira cadastrada" + "Gerenciar carteiras".

Só a escolha explícita do usuário é gravada em `localStorage`; o fallback é recalculado a cada carregamento.

## Transações sem carteira

Registros anteriores a esta mudança podem ter `wallet_id` nulo. Como não existe mais a visão "todas as carteiras", **eles não aparecem em nenhuma tela**. Para trazê-los para uma carteira:

```sql
UPDATE transactions SET wallet_id = '<uuid da carteira>' WHERE wallet_id IS NULL;
```

## Carteira de testes do Claude

Transações criadas pelo Claude Code para teste ou depuração vão **sempre** para
a carteira `Claude` — nunca para as carteiras reais do usuário. Se ela não
existir, é criada antes (`POST /wallets` com `{ "name": "Claude", "color": "#d97757" }`)
e selecionada no seletor da sidebar; a partir daí as transações nascem nela.

Como o app escopa tudo pela carteira ativa, esses dados ficam invisíveis
enquanto outra carteira estiver selecionada — não é preciso limpá-los depois.
Regra completa no `CLAUDE.md` da raiz do projeto.

## Relacionados

- `.claude/docs/domain/wallet.md` — entidade
- `.claude/docs/api/transactions.md` — filtro `walletId`
- `.claude/docs/frontend/transactions-filters.md` — demais filtros da tela
- `CLAUDE.md` (raiz) — regra de dados de teste
