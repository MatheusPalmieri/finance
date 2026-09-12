import { Elysia, t } from "elysia"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { wallets } from "../db/schema"

export const walletsRoute = new Elysia({ prefix: "/wallets" })
  .get("/", () => db.select().from(wallets).orderBy(wallets.name))
  .post(
    "/",
    async ({ body }) => {
      const [wallet] = await db
        .insert(wallets)
        .values({
          name: body.name,
          color: body.color ?? "#6366f1",
        })
        .returning()
      return wallet
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        color: t.Optional(t.String()),
      }),
    }
  )
  .put(
    "/:id",
    async ({ params, body, status }) => {
      const [wallet] = await db
        .update(wallets)
        .set({ name: body.name, color: body.color })
        .where(eq(wallets.id, params.id))
        .returning()
      if (!wallet) return status(404, { message: "Carteira não encontrada" })
      return wallet
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        color: t.Optional(t.String()),
      }),
    }
  )
  .delete("/:id", async ({ params, status }) => {
    const [wallet] = await db
      .delete(wallets)
      .where(eq(wallets.id, params.id))
      .returning()
    if (!wallet) return status(404, { message: "Carteira não encontrada" })
    return { success: true }
  })
