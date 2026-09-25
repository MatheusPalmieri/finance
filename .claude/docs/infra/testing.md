---
title: Testes da API — unitários e e2e
area: infra
updated: 2026-09-24
---

## Visão geral

A suíte do `api/` tem duas camadas:

- **Unitários** — funções puras (normalização, estatística, Monte Carlo,
  parcelamento, veredito, sanitização de saída de LLM). Não tocam banco nem rede.
- **E2E** — exercitam as rotas reais contra um Postgres de teste, pelo
  `app.handle()` do Elysia. Sem abrir porta, sem `fetch` de rede.

```bash
bun run test        # prepara o banco de teste e roda tudo
bun run test:db     # só prepara o banco (idempotente)
bun test <caminho>  # roda um arquivo, assumindo o banco já preparado
bun test --coverage
```

Referência rápida: ~460 testes, ~9s, e a suíte é **repetível** — rodar duas
vezes seguidas dá o mesmo resultado.

## Banco de teste

`src/test/env.ts` deriva a URL trocando o nome do banco da `DATABASE_URL` por
**`finance_test`** (ou usa `TEST_DATABASE_URL`, se definida).

> **Guarda-chuva obrigatório:** se a URL resolvida apontar para o mesmo banco de
> desenvolvimento, o setup **lança**. Os testes apagam tabelas; perder os dados
> reais do usuário por um descuido de configuração não é risco aceitável.

`scripts/test-db.ts` cria o banco se não existir e aplica o schema com
`drizzle-kit push` — o mesmo caminho do desenvolvimento, então o schema de teste
nunca diverge.

### Preload

`bunfig.toml` aponta `preload = ["./src/test/setup.ts"]`. O preload roda **antes**
de qualquer arquivo de teste, portanto antes de `src/db/index.ts` ser importado
— que lê `DATABASE_URL` no momento do import. É o que garante o isolamento.

O preload também aponta a IA para um Ollama inalcançável
(`LLM_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://127.0.0.1:1`) e zera as
`PLUGGY_*`: sem isso, um Ollama rodando na máquina ou as credenciais reais do
`api/.env` fariam os testes saírem pela rede. Quem precisa de IA ou de Open
Finance injeta o dublê.

### Dublês (`src/test/mocks/`)

| Arquivo | Injetado com |
|---|---|
| `llm.ts` — `MockLlmProvider` | `useMockLlm()` / `__setLlm()` |
| `open-finance.ts` — `MockOpenFinanceProvider` | `__setProvider()` |

Moram em `src/test/` de propósito: o código de produção não importa nada
dali, então o app em execução nunca serve dado fake.

## Helpers (`src/test/helpers.ts`)

| Helper | Para quê |
|---|---|
| `api.get/post/put/patch/delete` | Cliente HTTP sobre `app.handle()`; devolve `{ status, body }` |
| `resetDatabase()` | Esvazia as tabelas entre os testes |
| `makeCategory/makeAccount/makeBudget/makeTransaction(s)` | Fábricas. `makeAccount(name, { balance })` grava o saldo no retrato `open_finance_snapshots`, como o sync faria; `makeTransaction` gera `externalId` único se não vier |
| `useMockLlm(...respostas)` | Instala o `MockLlmProvider` com uma fila |
| `withAiDisabled(fn)` | Roda um bloco com `LLM_ENABLED=false` |
| `expectRejection(promise)` | Espera rejeição e devolve o erro |
| `monthsAgo(n, dia)` / `monthOffset(n)` | Datas relativas ao mês corrente |

### Duas decisões que custaram tempo

**`resetDatabase` usa `DELETE`, não `TRUNCATE`.** `TRUNCATE` exige
`ACCESS EXCLUSIVE` e fica na fila atrás de **qualquer** escrita ainda em voo —
inclusive a telemetria que o app dispara sem esperar (`registerHits`, o insert
em `llm_calls`). Com `TRUNCATE`, uma escrita pendente trava a suíte inteira sem
dizer por quê. Há ainda um `lock_timeout` de 5s como rede de segurança: se
houver contenção, o teste falha com o erro do Postgres em vez de pendurar.

**`expectRejection` em vez de `expect(p).rejects.*`.** A forma `.rejects` trava o
runner de forma reprodutível quando a rejeição vem depois de chamadas
assíncronas ao banco (a promessa fica pendente até o timeout do teste). O
`try/catch` é determinístico e não depende do comportamento interno do runner.

> Se a suíte pendurar mesmo assim, quase sempre é um processo de teste órfão de
> uma execução anterior segurando lock. Para conferir:
> `select pid, state, wait_event_type, query from pg_stat_activity where datname = 'finance_test'`.

## O que cada arquivo e2e cobre

| Arquivo | Spec | Cenários |
|---|---|---|
| `src/e2e/classification.e2e.test.ts` | 01 | As 3 camadas, o seed do de-para, o Pix dinâmico, aprendizado por feedback e o conflito 409, CRUD de regras com preview, séries recorrentes |
| `src/e2e/apply-rule.e2e.test.ts` | 01 | "Aplicar às existentes": prévia só com o que muda, casamento pelo `originalName`, só campos de classificação, idempotência, fixo sem orçamento e entrada nunca essencial |
| `src/e2e/reports.e2e.test.ts` | 02 | Totais contra o dashboard, orçamentos, 50/30/20, anomalias, movers, estabelecimentos novos, insights, narrativa e ciclo de vida |
| `src/e2e/forecast.e2e.test.ts` | 03 | Saldo inicial, determinismo, percentis, cenários, veredito, acionáveis, parser e preferências |
| `src/e2e/llm.e2e.test.ts` | 00 | Health, telemetria em `llm_calls` (inclusive falhas), consumo agregado |
| `src/e2e/integration.e2e.test.ts` | 01+02 | Escritas de transação alimentando o detector, assinaturas no check-up, dashboard e relatório contando a mesma história |

## Critérios de aceite das specs cobertos por teste

| Critério | Onde |
|---|---|
| Importar com IA desligada dá o mesmo resultado de antes | `classification.e2e` |
| Corrigir categoria cria regra e a reimportação acerta | `classification.e2e` |
| Nenhum valor monetário vai ao provedor | `classification.e2e` |
| `aiAvailable: false` com `LLM_ENABLED=false` | todas as suítes e2e |
| Totais do relatório batem com `/dashboard/summary` | `reports.e2e`, `integration.e2e` |
| Narrativa com número inventado é rejeitada | `reports.e2e` + `narrative.test.ts` |
| Regerar sobrescreve, não duplica | `reports.e2e` |
| Mês vazio abre sem erro | `reports.e2e` |
| `openingBalance` exclui cartão e lista as contas | `forecast.e2e` |
| Mesma projeção duas vezes dá números idênticos | `forecast.e2e` |
| Percentis sempre monotônicos | `forecast.e2e` + `montecarlo.test.ts` |
| 10x sem juros aplica `total/10` em 10 meses | `forecast.e2e` + `scenario.test.ts` |
| Gasto absurdo devolve `no` sem travar | `forecast.e2e` + `verdict.test.ts` |
| Pouco histórico é sinalizado | `forecast.e2e` |
| Toda chamada de LLM grava em `llm_calls`, inclusive as que falham | `llm.e2e` |
| `ANTHROPIC_API_KEY` não aparece em log | `llm/log.test.ts` |
| Prompt e resposta nunca vão ao banco | `llm.e2e` |

## Cobertura

Os módulos das quatro specs ficam entre **86% e 100%** de linhas. O que fica de
fora é deliberado:

- `routes/{accounts,budgets,categories}` — CRUD anterior às specs, sem
  teste automatizado ainda.
- `routes/transactions.ts` — coberto: listagem, reclassificação (PATCH) e a
  ausência de criar/importar/excluir (`integration.e2e.test.ts`).

## Limite conhecido

**Não há testes automatizados no `app/`.** As seções "Testes" das quatro specs
descrevem apenas testes da API, e a verificação do frontend nelas é manual.
Montar uma suíte de componentes é trabalho à parte, ainda não feito.

**Dados de teste nunca vão para o banco de desenvolvimento**: não existe mais
lançamento manual nem conta sandbox. Teste automatizado roda em `finance_test`;
verificação manual no navegador só lê os dados reais (e pode reclassificar).
