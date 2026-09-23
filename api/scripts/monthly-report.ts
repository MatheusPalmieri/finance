// Gera o check-up mensal (do mês anterior ou de um mês específico).
//
//   bun run api/scripts/monthly-report.ts            # mês anterior
//   bun run api/scripts/monthly-report.ts 2026-08    # mês específico
//
// Chama o mesmo `service.generate()` da rota — a lógica nunca é duplicada aqui.
// Idempotente: rodar duas vezes sobrescreve o relatório, não duplica.
//
// Agendamento no Windows: ver `.claude/docs/infra/scheduler.md`.

import { reportsService } from "../src/modules/reports"

function parseArg(arg: string | undefined): { month: number; year: number } {
  if (!arg) {
    const now = new Date()
    const zeroBased = now.getFullYear() * 12 + now.getMonth() - 1
    return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 }
  }

  const match = /^(\d{4})-(\d{2})$/.exec(arg)
  if (!match) {
    console.error(`Formato inválido: "${arg}". Use YYYY-MM (ex.: 2026-08).`)
    process.exit(1)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) {
    console.error(`Mês inválido: ${month}`)
    process.exit(1)
  }
  return { month, year }
}

const { month, year } = parseArg(process.argv[2])
const period = `${year}-${String(month).padStart(2, "0")}`

console.log(`Gerando check-up de ${period}...`)

try {
  const report = await reportsService.generate({ month, year })
  const critical = report.insights.filter((i) => i.severity === "critical")
  console.log(
    `✓ ${report.status}, ${report.insights.length} insight(s), ${critical.length} crítico(s)`
  )
  process.exit(0)
} catch (err) {
  console.error("✗", err instanceof Error ? err.message : err)
  process.exit(1)
}
