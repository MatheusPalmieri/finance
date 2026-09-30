import { Elysia, t } from "elysia"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { categories } from "../db/schema"

// O grupo 50/30/20 mora na categoria: todo gasto dela herda o grupo. Também é
// editado pela tela de Orçamentos, junto com o plano (PUT /budgets/:categoryId)
const groupUnion = t.Union([
  t.Literal("essential"),
  t.Literal("variable"),
  t.Literal("investment"),
])

const categoryBody = t.Object({
  name: t.String({ minLength: 1 }),
  color: t.Optional(t.String()),
  group: t.Optional(groupUnion),
})

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
          group: body.group ?? "variable",
        })
        .returning()
      return category
    },
    { body: categoryBody }
  )
  .put(
    "/:id",
    async ({ params, body, status }) => {
      const [category] = await db
        .update(categories)
        .set({ name: body.name, color: body.color, group: body.group })
        .where(eq(categories.id, params.id))
        .returning()
      if (!category) return status(404, { message: "Categoria não encontrada" })
      return category
    },
    { body: categoryBody }
  )
  .delete("/:id", async ({ params, status }) => {
    const [category] = await db
      .delete(categories)
      .where(eq(categories.id, params.id))
      .returning()
    if (!category) return status(404, { message: "Categoria não encontrada" })
    return { success: true }
  })
