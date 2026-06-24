import { Elysia, t } from "elysia"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { banks } from "../db/schema"

export const banksRoute = new Elysia({ prefix: "/banks" })
  .get("/", () => db.select().from(banks).orderBy(banks.name))
  .post(
    "/",
    async ({ body }) => {
      const [bank] = await db
        .insert(banks)
        .values({
          name: body.name,
          color: body.color ?? "#6366f1",
        })
        .returning()
      return bank
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
      const [bank] = await db
        .update(banks)
        .set({ name: body.name, color: body.color })
        .where(eq(banks.id, params.id))
        .returning()
      if (!bank) return status(404, { message: "Banco não encontrado" })
      return bank
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        color: t.Optional(t.String()),
      }),
    }
  )
  .delete("/:id", async ({ params, status }) => {
    const [bank] = await db
      .delete(banks)
      .where(eq(banks.id, params.id))
      .returning()
    if (!bank) return status(404, { message: "Banco não encontrado" })
    return { success: true }
  })
