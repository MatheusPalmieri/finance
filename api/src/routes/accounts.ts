import { Elysia, t } from "elysia"
import { eq, ne } from "drizzle-orm"
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
  .get("/", () => db.select().from(accounts).orderBy(accounts.createdAt))
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
