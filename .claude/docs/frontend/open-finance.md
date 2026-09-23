---
title: Frontend — Open Finance, Investimentos e saldo ao vivo
area: frontend
updated: 2026-09-23
---

## Visão geral

Telas da spec 04. O que vem da Pluggy aparece com o selo **"ao vivo"**: saldo e
investimentos nunca são guardados no app. Todas as telas usam os tokens
existentes (`FINANCE`, `PALETTE`, `tint()`) e os mesmos cards
`rounded-xl border bg-card` com entrada animada.

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
- **Contas vinculadas:** saldo ao vivo. No cartão, barra de uso do limite
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
- **"Atualizar"** busca com `fresh=true` e ignora o cache de 5 min do backend.

## Integração nas telas existentes

| Tela | O que mudou |
|---|---|
| Início | Card **"Patrimônio agora"** = conta + investimentos − usado do cartão, com selo ao vivo. Some se o Open Finance não estiver configurado |
| Contas | Contas vinculadas mostram o saldo ao vivo e o selo "Open Finance · ao vivo". No cartão, o valor entra negativo (usado do limite). O total virou **"Saldo das contas"**, porque o patrimônio com investimentos está no Início. Selo "Sandbox" nas contas de teste |
| Transações | Selos **"Pendente"** (fatura aberta ou parcela futura) e **"Interno"** (tooltip com o motivo: fatura, aplicação/resgate, transferência própria) e "· Open Finance" na linha de meta |
| Importar CSV | Toast "N importadas · M já vieram pelo Open Finance" |
| Projeção | "Saldo hoje · ao vivo" e, nas premissas, o saldo inicial detalhado por conta e com a origem |

## Hooks (`lib/queries.ts`)

`useOpenFinanceStatus`, `useOpenFinanceSyncWatcher`, `useSyncOpenFinance`,
`useSyncRuns`, `useLiveBalances` (staleTime 60s), `useLiveInvestments`
(staleTime 5 min), `useRelinkOpenFinanceAccount`. Chaves em
`keys.openFinance.*`.

## Validação no navegador (2026-09-23)

Com os dados reais: as telas carregaram sem erro de console; "Sincronizar agora"
criou um `sync_run` manual e voltou para "Em dia"; o saldo ao vivo apareceu nas
contas, no Início e na projeção (R$ 34.255,47); o selo "Interno" apareceu no
pagamento de fatura.
