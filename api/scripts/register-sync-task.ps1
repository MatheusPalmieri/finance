# Registra (ou remove) a tarefa diária do Agendador do Windows que roda
# `bun run sync:pluggy`. Ver .claude/docs/infra/open-finance-sync.md.
#
#   powershell -ExecutionPolicy Bypass -File api\scripts\register-sync-task.ps1
#   powershell -ExecutionPolicy Bypass -File api\scripts\register-sync-task.ps1 -Remove
#
# Roda às 07:00 (a Pluggy coleta 1x por dia, de madrugada). Se o PC estiver
# desligado nesse horário, roda assim que ligar (StartWhenAvailable). Não é
# obrigatória: o app também sincroniza sozinho ao abrir com dados de mais de 6h.

param(
  [switch]$Remove,
  [string]$At = "07:00"
)

$TaskName = "Finance - Sync Open Finance"

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Tarefa '$TaskName' removida."
  exit 0
}

$apiDir = Split-Path -Parent $PSScriptRoot
$bun = (Get-Command bun -ErrorAction Stop).Source

$action = New-ScheduledTaskAction -Execute $bun -Argument "run sync:pluggy" -WorkingDirectory $apiDir
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Sincroniza as transacoes do Open Finance (Pluggy) no projeto finance" -Force | Out-Null

Write-Output "Tarefa '$TaskName' registrada: todo dia as $At (bun run sync:pluggy em $apiDir)."
