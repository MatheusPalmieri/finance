---
title: Sync do Open Finance — script e agendamento
area: infra
updated: 2026-09-23
---

## Visão geral

O sync (`domain/open-finance.md`) tem três gatilhos, todos chamando o mesmo
`runSync()`:

| Gatilho | Quando | `sync_runs.trigger` |
|---|---|---|
| App aberto | `GET /open-finance/status` com dados de mais de 6h | `stale` |
| Botão "Sincronizar agora" | `POST /open-finance/sync` | `manual` |
| Script / Agendador | `bun run sync:pluggy` | `cli` |

O agendador é **conveniência**: com o app aberto ao menos uma vez por dia, o
gatilho `stale` já mantém tudo em dia.

## Script

```bash
cd api
bun run sync:pluggy              # incremental (completo se o último completo tiver > 7 dias)
bun run sync:pluggy --full       # janela completa (12 meses, ou desde OPEN_FINANCE_HISTORY_FROM)
bun run sync:pluggy --refresh    # pede ao banco uma coleta nova antes (espera até 2 min)
bun run sync:pluggy --dry-run    # relatório do que faria, sem gravar nada
bun run sync:pluggy --ai         # liga a camada de IA na classificação das novas
```

Imprime o resumo por conta (lidas, novas, atualizadas, removidas, iguais). No
fim grava o retrato de saldos e **espera** o de investimentos (ao contrário do
app, onde ele roda em segundo plano, aqui o `process.exit` o interromperia). A
Pluggy só é chamada se o retrato passou de 1 h (ver `domain/open-finance.md`,
"Cache persistente"). Códigos de saída: `0` ok, `1` erro, `2` outro sync em andamento.

Requisitos: Postgres no ar e `PLUGGY_*` no `api/.env`.

## Agendador do Windows

```powershell
# registra: todo dia às 07:00 (a Pluggy coleta 1x por dia, de madrugada)
powershell -ExecutionPolicy Bypass -File api\scripts\register-sync-task.ps1
# outro horário
powershell -ExecutionPolicy Bypass -File api\scripts\register-sync-task.ps1 -At 08:30
# remove
powershell -ExecutionPolicy Bypass -File api\scripts\register-sync-task.ps1 -Remove
```

Tarefa: **"Finance - Sync Open Finance"**. Roda `bun run sync:pluggy` com
diretório de trabalho em `api/`, com `StartWhenAvailable` (se o PC estiver
desligado às 07:00, roda ao ligar) e limite de 15 min.

## Testes

A suíte **nunca** fala com a Pluggy: `src/test/setup.ts` zera as `PLUGGY_*`, e
os testes injetam o `MockOpenFinanceProvider` com `__setProvider()`. Suítes:
`modules/open-finance/normalize.test.ts`, `e2e/open-finance-sync.e2e.test.ts` e
`e2e/open-finance-routes.e2e.test.ts`.
