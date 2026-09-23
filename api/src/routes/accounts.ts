import { Elysia, t } from "elysia"
import { eq, getTableColumns, ne, sql } from "drizzle-orm"
import { db } from "../db"
import { accounts } from "../db/schema"

const accountTypeUnion = t.Union([
  t.Literal("CHECKING"),
  t.Literal("SAVINGS"),
  t.Literal("CREDIT_CARD"),
  t.Literal("INVESTMENT"),
  t.Literal("CASH"),
  t.Literal("OTHER"),
])

// Garante que apenas uma conta fique marcada como padrão por vez
async function unsetOtherDefaults(exceptId?: string) {
  await db
    .update(accounts)
    .set({ isDefault: false })
    .where(exceptId ? ne(accounts.id, exceptId) : undefined)
}

export const accountsRoute = new Elysia({ prefix: "/accounts" })
  .get("/", () =>
    db
      .select({
        ...getTableColumns(accounts),
        // Ligada ao Open Finance: o saldo mostrado vem ao vivo da Pluggy.
        // Coluna qualificada à mão: dentro de um campo do select o Drizzle
        // renderiza `${accounts.id}` só como "id", que na subconsulta seria o
        // id da própria pluggy_accounts.
        openFinance: sql<boolean>`exists (select 1 from pluggy_accounts pa where pa.account_id = "accounts"."id")`,
      })
      .from(accounts)
      .orderBy(accounts.createdAt)
  )
  // Rota estática antes da dinâmica (/:id) para não colidir
  .get("/default", async () => {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.isDefault, true))
      .limit(1)
    return account ?? null
  })
  .get("/:id", async ({ params, status }) => {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.id))
    if (!account) return status(404, { message: "Conta não encontrada" })
    return account
  })
  .post(
    "/",
    async ({ body }) => {
      const [account] = await db
        .insert(accounts)
        .values({
          name: body.name,
          type: body.type,
          balance: String(body.balance ?? 0),
          color: body.color ?? "#6366f1",
          icon: body.icon ?? "wallet",
          isDefault: body.isDefault ?? false,
          isSandbox: body.isSandbox ?? false,
        })
        .returning()

      // Se nasceu como padrão, desmarca as demais
      if (account.isDefault) await unsetOtherDefaults(account.id)

      return account
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        type: accountTypeUnion,
        balance: t.Optional(t.Number()),
        color: t.Optional(t.String()),
        icon: t.Optional(t.String()),
        isDefault: t.Optional(t.Boolean()),
        // Conta de testes: fica fora de toda análise (ver lib/scope.ts)
        isSandbox: t.Optional(t.Boolean()),
      }),
    }
  )
  .put(
    "/:id",
    async ({ params, body, status }) => {
      const [account] = await db
        .update(accounts)
        .set({
          name: body.name,
          type: body.type,
          balance: body.balance !== undefined ? String(body.balance) : undefined,
          color: body.color,
          icon: body.icon,
          isDefault: body.isDefault,
          isSandbox: body.isSandbox,
        })
        .where(eq(accounts.id, params.id))
        .returning()
      if (!account) return status(404, { message: "Conta não encontrada" })

      if (body.isDefault) await unsetOtherDefaults(account.id)

      return account
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        type: accountTypeUnion,
        balance: t.Optional(t.Number()),
        color: t.Optional(t.String()),
        icon: t.Optional(t.String()),
        isDefault: t.Optional(t.Boolean()),
        // Conta de testes: fica fora de toda análise (ver lib/scope.ts)
        isSandbox: t.Optional(t.Boolean()),
      }),
    }
  )
  .delete("/:id", async ({ params, status }) => {
    const [account] = await db
      .delete(accounts)
      .where(eq(accounts.id, params.id))
      .returning()
    if (!account) return status(404, { message: "Conta não encontrada" })
    return { success: true }
  })
