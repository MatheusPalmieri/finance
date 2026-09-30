// Prepara o banco de testes: cria se não existir e aplica o schema atual.
//
// Roda antes de `bun test` (ver o script "test" no package.json). É idempotente
// e rápido quando o banco já está no formato certo.

import postgres from "postgres"
import {
  adminDatabaseUrl,
  resolveTestDatabaseUrl,
  testDatabaseName,
} from "../src/test/env"

const testUrl = resolveTestDatabaseUrl()
const dbName = testDatabaseName(testUrl)

// ── 1. Cria o banco se necessário ────────────────────────────────────────────
const admin = postgres(adminDatabaseUrl(testUrl), { max: 1 })
try {
  const [existing] = await admin`
    select 1 from pg_database where datname = ${dbName}
  `
  if (!existing) {
    // Nome vem do próprio arquivo de env, não de entrada do usuário
    await admin.unsafe(`create database "${dbName}"`)
    console.log(`✓ banco de teste "${dbName}" criado`)
  }
} catch (err) {
  console.error(
    `✗ não foi possível preparar o banco de teste "${dbName}".`,
    "O Postgres está no ar? (docker compose up -d)"
  )
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  await admin.end()
}

// ── 2. Aplica o schema ───────────────────────────────────────────────────────
// `drizzle-kit push` é o mesmo caminho usado em desenvolvimento (o projeto não
// mantém arquivos de migração), então o schema de teste nunca diverge.
function push() {
  const run = Bun.spawnSync(["bunx", "drizzle-kit", "push", "--force"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    // Sem stdin: uma pergunta do drizzle-kit falha na hora em vez de travar
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = `${run.stdout.toString()}
${run.stderr.toString()}`
  // O drizzle-kit sai com código 0 mesmo quando falha: com enum ou coluna
  // renomeada ele quer perguntar no terminal e, sem TTY, só imprime o erro. Por
  // isso o sucesso é a confirmação na saída, não o código de saída
  return { ok: /Changes applied|No changes detected/.test(output), output }
}

let result = push()
if (!result.ok) {
  // Banco descartável: recria o schema do zero e aplica de novo, sem perguntas
  const reset = postgres(testUrl, { max: 1, onnotice: () => {} })
  try {
    await reset.unsafe("drop schema public cascade; create schema public")
  } finally {
    await reset.end()
  }
  result = push()
}

if (!result.ok) {
  console.error("✗ falha ao aplicar o schema no banco de teste")
  console.error(result.output)
  process.exit(1)
}

console.log(`✓ schema aplicado em "${dbName}"`)
