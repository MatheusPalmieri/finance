---
title: Frontend — Open Finance, Investimentos e saldos
area: frontend
updated: 2026-09-23
---

## Visão geral

Telas da spec 04. O Open Finance é a **única** fonte de dados (ver
`decisions/open-finance-fonte-unica.md`): não há tela de lançamento, importação
nem saldo digitado. Saldos e investimentos vêm do retrato salvo no banco, e todo
número vem acompanhado do selo `SnapshotStatus`, que diz **de quando** ele é.
Todas as telas usam os tokens existentes (`FINANCE`, `PALETTE`, `tint()`) e os
mesmos cards `rounded-xl border bg-card` com entrada animada.

## `SnapshotStatus` (`components/open-finance/SnapshotStatus.tsx`)

Selo com ponto colorido a partir dos metadados do retrato (`SnapshotMeta`):

| Estado | Texto | Cor |
|---|---|---|
| Retrato válido | "atualizado há 3 min" | `FINANCE.income` |
| `stale` (Pluggy fora) | "desatualizado · há 2 h" (tooltip com o erro) | `PALETTE.amber` |
| `available: false` | "indisponível" | `FINANCE.neutral` |

A idade vem de `snapshotAge()` em `lib/format.ts` ("agora", "há N min", "há N h",
data e hora).

## Rotas

| Rota | Página | Item na sidebar |
|---|---|---|
| `/open-finance` | `pages/OpenFinance/index.tsx` | "Open Finance" (ícone `Cable`) |
| `/investments` | `pages/Investments/index.tsx` | "Investimentos" (ícone `ChartPie`) |

## Sync automático ao abrir o app

`useOpenFinanceSyncWatcher()` (em `lib/queries.ts`) é montado uma vez no
`AppLayout`:

1. `useOpenFinanceStatus()` faz `GET /open-finance/status`. Com dados de mais de
   6h, o **backend** já dispara o sync em segundo plano.
2. Enquanto `running`, o status faz polling a cada 2s, **inclusive com a aba em
   segundo plano** (`refetchIntervalInBackground`). Sem isso, o "Sincronizando"
   ficava preso até a aba voltar ao foco, como apareceu no teste no navegador.
3. Na transição de rodando para parado: invalida transações, dashboard, projeção,
   check-up, recorrências, contas e Open Finance, e mostra um toast com o
   resultado (ou o erro).

## `/open-finance`

- **Botões:** "Sincronizar agora" (`POST /sync`) e "Buscar no banco" (`refresh`:
  pede coleta nova à Pluggy, até 2 min).
- **Card da conexão:** banco, estado ("Em dia" verde com pulso, "Dados
  desatualizados" âmbar, "Última sincronização falhou" vermelho com a mensagem),
  nossa última sync, última coleta do banco e última sync completa.
- **Contas vinculadas:** saldo do retrato, com `SnapshotStatus` no cabeçalho. No cartão, barra de uso do limite
  (vermelha acima de 85%), disponível e vencimento. O vencimento só aparece se
  for futuro: a Pluggy devolve o da última fatura. O select "Lança em" troca o
  vínculo (`PATCH /open-finance/accounts/:id`) e move as transações.
- **Histórico:** `sync_runs` com gatilho (Manual / Ao abrir o app /
  Script/agendador), contadores e duração.
- **Sem configuração:** estado vazio explicando as `PLUGGY_*`.

## `/investments`

- **KPIs:** patrimônio investido, valor aplicado, rendimento (R$ e %) e liquidez
  diária ("conta como caixa na projeção").
- **Alocação:** barra empilhada por classe (`ASSET_CLASS_HEX` em
  `types/finance.ts`) e legenda com % e valor.
- **Proventos:** total de 12 meses e barras dos últimos 6 meses.
- **Posições:** agrupadas por classe. Na renda fixa, o título é produto + taxa
  ("CDB 120% CDI"), porque o nome da Pluggy é o do emissor e se repete em todas as
  linhas, e o detalhe traz o emissor abreviado e o vencimento. Na renda variável:
  ticker, cotas, cotação, preço médio, aplicado, rendimento colorido e valor
  atual.
- **"Atualizar"** busca com `fresh=true`: ignora o retrato (prazo de 1 h), vai à
  Pluggy e regrava. O cabeçalho mostra `SnapshotStatus`.
- **Sem retrato:** estado vazio "Investimentos indisponíveis" com o motivo.

## Integração nas telas existentes

| Tela | O que mudou |
|---|---|
| Início | Card **"Patrimônio agora"** = conta + investimentos − usado do cartão, com `SnapshotStatus`. Some só se o Open Finance não estiver configurado **e** não houver retrato |
| Contas | Sem "Nova conta" nem excluir. Card de "Saldo das contas" = `cash − cardDebt` do retrato, com `SnapshotStatus`; "—" se não houver retrato. Cada conta mostra o saldo do retrato (cartão negativo, com limite e vencimento) ou "—", e o selo "Open Finance" / "Sem vínculo". O lápis abre **"Editar conta"**: só nome e cor (tipo e saldo são do banco) |
| Transações | Sem "Nova transação", "Importar CSV" nem excluir. O lápis abre **"Reclassificar transação"**: um bloco de leitura com data, conta e valor ("vêm do Open Finance") e os campos do usuário (nome, categoria, forma de pagamento, essencial, recorrência, orçamento, observação). Estado vazio aponta para `/open-finance`. Selos **"Pendente"** e **"Interno"** |
| Projeção | "Saldo hoje" com " · desatualizado" (`stale`) ou " · sem Open Finance" (`unavailable`); nas premissas, a origem do saldo inicial em texto |

## Hooks (`lib/queries.ts`)

`useOpenFinanceStatus`, `useOpenFinanceSyncWatcher`, `useSyncOpenFinance`,
`useSyncRuns`, `useBalances` (staleTime 60s), `useInvestments` (staleTime
5 min), `useRelinkOpenFinanceAccount`, `useUpdateAccount` (só aparência) e
`useReclassifyTransaction`. Chaves em `keys.openFinance.*`.

Removidos em 2026-09-23: `useCreateTransaction`, `useUpdateTransaction`,
`useDeleteTransaction`, `useBulkCreateTransactions`, `useCreateAccount`,
`useDeleteAccount`, `useDefaultAccount`, o `ImportModal` e o parser `csv.ts`.

## Validação no navegador (2026-09-23, antes da fonte única)

Com os dados reais: as telas carregaram sem erro de console; "Sincronizar agora"
criou um `sync_run` manual e voltou para "Em dia"; o saldo ao vivo apareceu nas
contas, no Início e na projeção (R$ 34.255,47); o selo "Interno" apareceu no
pagamento de fatura.
