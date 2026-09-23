# ADR — Remoção da integração Open Finance (Pluggy)

**Data:** 2026-09-20
**Status:** Substituído em 2026-09-23 pela spec 04
(`.claude/docs/specs/04-open-finance.md`). O Open Finance voltou como fonte
**primária**, agora conectado à conta real (Meu Pluggy) e alimentando
`transactions`, que era o que faltava aqui. O texto abaixo fica como registro.

## Contexto

O módulo Open Finance foi construído para ler contas, saldos e transações por um
agregador regulado (Pluggy). Na prática ele nunca saiu do sandbox: a única
conexão existente no banco era o conector `2` ("Pluggy Bank", `isSandbox: true`),
com 34 transações fictícias importadas.

Isso criava dois problemas:

1. **Dados falsos misturados ao app.** As transações sandbox ficavam em tabelas
   `open_finance_*` e apareciam na página `/open-finance` como se fossem reais.
2. **Superfície morta.** Quatro tabelas, quatro enums, um módulo de backend com
   provider/sync/normalize, uma página no frontend, seis variáveis de ambiente e
   três documentos — nada disso alimentava uma leitura financeira de verdade.

A fonte de dados real do projeto é outra: os extratos CSV do Nubank, importados
pela tela de Transações.

## Decisão

Remover a integração inteira — código, tabelas, rotas, página, variáveis de
ambiente e documentação.

O fluxo de entrada de dados passa a ser exclusivamente:

- **Manual** — "Nova transação" na página de Transações.
- **CSV** — `ImportModal` (UI) ou `bun run import:csv` (linha de comando, para
  carregar vários extratos de uma vez).

## Consequências

**Removido:**

| Camada | O que saiu |
|---|---|
| Banco | `open_finance_connections`, `open_finance_accounts`, `open_finance_transactions`, `open_finance_sync_runs` e os enums `of_connection_status`, `of_sync_status`, `of_sync_trigger`, `of_tx_direction` |
| Backend | `api/src/modules/open-finance/` inteiro; registro em `app.ts`; blocos de schema, relations e types |
| Frontend | `app/src/pages/OpenFinance/`; rota e item de menu; `api.openFinance.*`; hooks `useOpenFinance*`; tipos `OpenFinance*` |
| Config | `OPEN_FINANCE_*` e `PLUGGY_*` em `api/.env` e `.env.example` |
| Docs | `{domain,api,frontend}/open-finance.md`, `docs/open-finance-decision.md`, seção do README |

**Credenciais:** o `api/.env` continha `PLUGGY_CLIENT_ID/SECRET` e um
`PLUGGY_API_KEY`. O arquivo sempre esteve no `.gitignore`, então nada vazou para
o histórico do repositório — mas as credenciais foram apagadas do arquivo local.
Se a conta Pluggy não for mais usada, convém revogá-la no dashboard.

**Reversão:** o código está no histórico do git. As tabelas voltam com
`bun run db:push` depois de restaurar o schema — mas os dados sandbox não voltam,
e não fazem falta.

## Alternativas consideradas

- **Manter com `OPEN_FINANCE_PROVIDER=mock`** — continuaria gerando dados falsos,
  que é exatamente o problema.
- **Manter desligado por feature flag** — mantém a superfície morta e o custo de
  manutenção (schema, tipos, testes) sem nenhum ganho.
- **Trocar Pluggy por outro agregador** — o custo real do Open Finance não é o
  provedor, é o consentimento recorrente e a manutenção da sincronização. O CSV
  resolve o caso de uso atual sem nenhum dos dois.
