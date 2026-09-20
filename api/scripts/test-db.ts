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
const push = Bun.spawnSync(
  ["bunx", "drizzle-kit", "push", "--force"],
  {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdout: "pipe",
    stderr: "pipe",
  }
)

if (push.exitCode !== 0) {
  console.error("✗ falha ao aplicar o schema no banco de teste")
  console.error(push.stderr.toString())
  process.exit(1)
}

console.log(`✓ schema aplicado em "${dbName}"`)
