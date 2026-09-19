---
title: Agendamento do check-up mensal
area: infra
updated: 2026-09-19
---

## Visão geral

O check-up mensal (`.claude/docs/domain/monthly-report.md`) pode ser gerado por
um agendador, mas **não precisa**: `GET /reports/monthly/current` gera sob
demanda quando a página abre. O agendador é conveniência — deixa o relatório
pronto antes de o usuário procurar.

## Script

```bash
# Da raiz do projeto
bun run api/scripts/monthly-report.ts            # mês anterior, todos os escopos
bun run api/scripts/monthly-report.ts 2026-08    # mês específico (YYYY-MM)

# De dentro de api/
bun run report:monthly 2026-08
```

Gera um relatório por escopo: o global (transações sem carteira) mais uma por
carteira cadastrada. Chama o mesmo `service.generate()` da rota — a lógica nunca
é duplicada no script — e é **idempotente**: rodar duas vezes sobrescreve, não
duplica.

Sai com código 1 se algum escopo falhar, e imprime o status e a contagem de
insights de cada um.

Requisitos: Postgres no ar e `api/.env` com `DATABASE_URL`. A IA é opcional —
sem ela o relatório sai `GENERATED`, só sem narrativa.

## Agendador de Tarefas do Windows

É o mais adequado ao ambiente do usuário (Windows 11) e não exige processo
rodando 24/7. Timezone do sistema: **America/Sao_Paulo**.

Criar a tarefa (PowerShell **como administrador**, ajustando os caminhos):

```powershell
$bun    = "$env:USERPROFILE\.bun\bin\bun.exe"
$projeto = "$env:USERPROFILE\http\finance"

$action  = New-ScheduledTaskAction -Execute $bun `
    -Argument "run api/scripts/monthly-report.ts" -WorkingDirectory $projeto
$trigger = New-ScheduledTaskTrigger -Monthly -DaysOfMonth 1 -At 09:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

Register-ScheduledTask -TaskName "Finance — check-up mensal" `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description "Gera o relatório mensal do mês anterior em todas as carteiras"
```

`-StartWhenAvailable` cobre o caso da máquina estar desligada no dia 1: a tarefa
roda assim que o computador ligar.

Rodar agora para testar, e inspecionar o resultado:

```powershell
Start-ScheduledTask -TaskName "Finance — check-up mensal"
Get-ScheduledTaskInfo -TaskName "Finance — check-up mensal"
```

Remover:

```powershell
Unregister-ScheduledTask -TaskName "Finance — check-up mensal" -Confirm:$false
```

> A tarefa exige o **Postgres no ar** no momento do disparo. Com o Docker
> configurado para iniciar com o sistema (`restart: unless-stopped` no
> `docker-compose.yml`, ver `.claude/docs/infra/docker.md`), isso já acontece.
> Se o container estiver parado, a tarefa falha e o fallback in-app cobre —
> o relatório é gerado quando a página abrir.

## Fallback in-app (obrigatório)

`GET /reports/monthly/current` gera o relatório do mês anterior na hora se ele
ainda não existir. Mesmo sem agendador nenhum, o usuário vê o check-up ao abrir
`/reports` ou o card no Home.

## Notificação (não implementado)

A spec prevê, como fase posterior, um webhook do Telegram com o resumo e o link
`http://localhost:5173/reports`, via variável `REPORT_WEBHOOK_URL`.

> **A confirmar:** se o usuário quer essa notificação e por qual canal.
