import { Elysia, t } from "elysia"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { categories } from "../db/schema"

export const categoriesRoute = new Elysia({ prefix: "/categories" })
  .get("/", () => db.select().from(categories).orderBy(categories.name))
  .post(
    "/",
    async ({ body }) => {
      const [category] = await db
        .insert(categories)
        .values({
          name: body.name,
          color: body.color ?? "#6366f1",
        })
        .returning()
      return category
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
      const [category] = await db
        .update(categories)
        .set({ name: body.name, color: body.color })
        .where(eq(categories.id, params.id))
        .returning()
      if (!category) return status(404, { message: "Categoria não encontrada" })
      return category
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        color: t.Optional(t.String()),
      }),
    }
  )
  .delete("/:id", async ({ params, status }) => {
    const [category] = await db
      .delete(categories)
      .where(eq(categories.id, params.id))
      .returning()
    if (!category) return status(404, { message: "Categoria não encontrada" })
    return { success: true }
  })
