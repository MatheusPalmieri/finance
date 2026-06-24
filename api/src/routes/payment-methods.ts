import { Elysia, t } from "elysia"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { paymentMethods } from "../db/schema"

export const paymentMethodsRoute = new Elysia({ prefix: "/payment-methods" })
  .get("/", () => db.select().from(paymentMethods).orderBy(paymentMethods.name))
  .post(
    "/",
    async ({ body }) => {
      const [paymentMethod] = await db
        .insert(paymentMethods)
        .values({
          name: body.name,
          color: body.color ?? "#6366f1",
        })
        .returning()
      return paymentMethod
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
      const [paymentMethod] = await db
        .update(paymentMethods)
        .set({ name: body.name, color: body.color })
        .where(eq(paymentMethods.id, params.id))
        .returning()
      if (!paymentMethod)
        return status(404, { message: "Forma de pagamento não encontrada" })
      return paymentMethod
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        color: t.Optional(t.String()),
      }),
    }
  )
  .delete("/:id", async ({ params, status }) => {
    const [paymentMethod] = await db
      .delete(paymentMethods)
      .where(eq(paymentMethods.id, params.id))
      .returning()
    if (!paymentMethod)
      return status(404, { message: "Forma de pagamento não encontrada" })
    return { success: true }
  })
