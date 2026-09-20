// Resolve a URL do banco de TESTE a partir da de desenvolvimento.
//
// Importado tanto pelo preload dos testes quanto pelo script que cria o banco,
// para que os dois nunca discordem sobre qual banco está em jogo.

const TEST_DB_NAME = "finance_test"

/**
 * `TEST_DATABASE_URL` quando definida; senão, a `DATABASE_URL` com o nome do
 * banco trocado por `finance_test`.
 *
 * Lança se o resultado apontar para o mesmo banco de desenvolvimento — os
 * testes truncam tabelas, e apagar os dados reais do usuário por um descuido de
 * configuração não é um risco aceitável.
 */
export function resolveTestDatabaseUrl(): string {
  const dev = process.env.DATABASE_URL
  const explicit = process.env.TEST_DATABASE_URL

  if (!explicit && !dev) {
    throw new Error(
      "DATABASE_URL não definida — os testes de integração precisam de um Postgres no ar (docker compose up -d)"
    )
  }

  const url = new URL(explicit ?? dev!)
  if (!explicit) url.pathname = `/${TEST_DB_NAME}`

  if (dev) {
    const devUrl = new URL(dev)
    if (
      devUrl.host === url.host &&
      devUrl.pathname === url.pathname
    ) {
      throw new Error(
        `A URL de teste aponta para o banco de desenvolvimento (${url.pathname.slice(1)}). ` +
          "Os testes truncam tabelas — ajuste TEST_DATABASE_URL."
      )
    }
  }

  return url.toString()
}

/** URL do banco `postgres` no mesmo servidor — usada para criar o de teste. */
export function adminDatabaseUrl(testUrl: string): string {
  const url = new URL(testUrl)
  url.pathname = "/postgres"
  return url.toString()
}

export function testDatabaseName(testUrl: string): string {
  return new URL(testUrl).pathname.slice(1)
}
