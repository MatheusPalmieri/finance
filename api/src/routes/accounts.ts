import { Elysia, t } from "elysia"
import { eq, getTableColumns, sql } from "drizzle-orm"
import { db } from "../db"
import { accounts } from "../db/schema"

// Contas nascem do sync do Open Finance (ver `ensureAccountLink` em
// modules/open-finance/sync.ts) — não existe criar, excluir nem digitar saldo.
// O usuário só ajusta a aparência (nome, cor, ícone). O saldo vem do retrato
// do Open Finance em GET /open-finance/balances.

export const accountsRoute = new Elysia({ prefix: "/accounts" })
  .get("/", () =>
    db
      .select({
        ...getTableColumns(accounts),
        // Ligada ao Open Finance. Coluna qualificada à mão: dentro de um campo
        // do select o Drizzle renderiza `${accounts.id}` só como "id", que na
        // subconsulta seria o id da própria pluggy_accounts.
        openFinance: sql<boolean>`exists (select 1 from pluggy_accounts pa where pa.account_id = "accounts"."id")`,
      })
      .from(accounts)
      .orderBy(accounts.createdAt)
  )
  .get("/:id", async ({ params, status }) => {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.id))
    if (!account) return status(404, { message: "Conta não encontrada" })
    return account
  })
  .patch(
    "/:id",
    async ({ params, body, status }) => {
      const [account] = await db
        .update(accounts)
        .set({ name: body.name, color: body.color, icon: body.icon })
        .where(eq(accounts.id, params.id))
        .returning()
      if (!account) return status(404, { message: "Conta não encontrada" })
      return account
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        color: t.Optional(t.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
        icon: t.Optional(t.String({ maxLength: 50 })),
      }),
    }
  )
