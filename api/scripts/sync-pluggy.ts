// Sincroniza o Open Finance (Pluggy) pela linha de comando.
//
//   bun run sync:pluggy              # incremental (completo se for a hora)
//   bun run sync:pluggy --full       # janela completa de 12 meses
//   bun run sync:pluggy --refresh    # pede ao banco uma coleta nova antes
//   bun run sync:pluggy --dry-run    # mostra o que faria, sem gravar nada
//   bun run sync:pluggy --ai         # liga a camada de IA na classificação
//
// É o que o Agendador do Windows chama (ver .claude/docs/infra/open-finance-sync.md).
// Mesmo `runSync()` das rotas — a lógica nunca é duplicada aqui.

import { isConfigured } from "../src/modules/open-finance"
import { getInvestments } from "../src/modules/open-finance/investments"
import { runSync, SyncBusyError } from "../src/modules/open-finance/sync"

const args = new Set(process.argv.slice(2))
const known = new Set(["--full", "--refresh", "--dry-run", "--ai"])
for (const arg of args) {
  if (!known.has(arg)) {
    console.error(`Opção desconhecida: ${arg}. Use ${[...known].join(" ")}`)
    process.exit(1)
  }
}

if (!isConfigured()) {
  console.error("✗ Open Finance não configurado: defina PLUGGY_* no api/.env")
  process.exit(1)
}

const dryRun = args.has("--dry-run")
console.log(dryRun ? "Simulando sincronização (nada será gravado)...\n" : "Sincronizando...\n")

try {
  const report = await runSync({
    trigger: "cli",
    full: args.has("--full"),
    refresh: args.has("--refresh"),
    dryRun,
    useAi: args.has("--ai") ? true : undefined,
  })

  for (const account of report.accounts) {
    console.log(
      `■ ${account.accountName} (${account.type}) desde ${account.from}: ` +
        `${account.fetched} lidas → ${account.created} novas, ` +
        `${account.updated} atualizadas, ${account.removed} removidas, ${account.unchanged} iguais`
    )
  }
  console.log(
    `\n${dryRun ? "Simulação" : "Sync"} ${report.full ? "completo" : "incremental"}: ` +
      `${report.created} novas, ${report.updated} atualizadas, ` +
      `${report.removed} removidas.`
  )
  // O sync já gravou o retrato de saldos. O de investimentos roda em segundo
  // plano no app; aqui é preciso esperar, senão o `exit` o interrompe. Só vai
  // à Pluggy se o retrato estiver vencido (1h)
  if (!dryRun) {
    const investments = await getInvestments()
    console.log(
      `Retrato de investimentos: ${investments.available ? `${investments.source}, ${investments.positions.length} posições` : `indisponível (${investments.error})`}`
    )
  }
  process.exit(0)
} catch (err) {
  if (err instanceof SyncBusyError) {
    console.error(`✗ ${err.message}`)
    process.exit(2)
  }
  console.error("✗", err instanceof Error ? err.message : err)
  process.exit(1)
}
