import { Elysia, t } from "elysia"
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm"
import { db } from "../db"
import { clientStatusEnum, clients } from "../db/schema"
import { normalizePhone } from "../lib/phone"

const CLIENT_STATUS_VALUES = clientStatusEnum.enumValues

export const clientsRoute = new Elysia({ prefix: "/clients" })
  // Lista clientes com paginação, busca, filtro de status e flag de duplicatas
  .get(
    "/",
    async ({ query }) => {
      const page = Number(query.page ?? 1)
      const limit = Number(query.limit ?? 20)
      const offset = (page - 1) * limit

      const conditions = [isNull(clients.deletedAt)]

      if (query.search) {
        conditions.push(
          or(
            ilike(clients.name, `%${query.search}%`),
            ilike(clients.city, `%${query.search}%`)
          )!
        )
      }

      if (query.status) {
        conditions.push(eq(clients.status, query.status as (typeof CLIENT_STATUS_VALUES)[number]))
      }

      // Subquery que detecta se o mesmo telefone existe em outro registro
      const hasDuplicateSql = sql<boolean>`EXISTS (
        SELECT 1 FROM clients c2
        WHERE c2.phone_area_code = ${clients.phoneAreaCode}
          AND c2.phone_number = ${clients.phoneNumber}
          AND c2.id != ${clients.id}
          AND c2.deleted_at IS NULL
      )`

      if (query.duplicates === "true") {
        conditions.push(sql`${hasDuplicateSql} = true`)
      }

      const [rows, [{ count }]] = await Promise.all([
        db
          .select({
            id: clients.id,
            name: clients.name,
            phoneAreaCode: clients.phoneAreaCode,
            phoneNumber: clients.phoneNumber,
            responsiblePhoneAreaCode: clients.responsiblePhoneAreaCode,
            responsiblePhoneNumber: clients.responsiblePhoneNumber,
            city: clients.city,
            status: clients.status,
            createdAt: clients.createdAt,
            updatedAt: clients.updatedAt,
            hasDuplicate: hasDuplicateSql,
          })
          .from(clients)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(clients)
          .where(and(...conditions)),
      ])

      return {
        data: rows,
        meta: { total: count, page, limit },
      }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
        status: t.Optional(t.String()),
        duplicates: t.Optional(t.String()),
      }),
    }
  )

  // Busca um cliente por ID
  .get("/:id", async ({ params, error }) => {
    const [client] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, params.id), isNull(clients.deletedAt)))
      .limit(1)

    if (!client) return error(404, { message: "Client not found" })
    return client
  })

  // Cria um novo cliente
  .post(
    "/",
    async ({ body, error }) => {
      const phoneNumber = normalizePhone(body.phoneNumber)

      if (phoneNumber.length !== 8) {
        return error(400, { message: "Phone number must have 8 digits" })
      }

      const [client] = await db
        .insert(clients)
        .values({
          name: body.name,
          phoneAreaCode: body.phoneAreaCode.replace(/\D/g, "").slice(0, 2),
          phoneNumber,
          city: body.city,
          status: body.status as (typeof CLIENT_STATUS_VALUES)[number] | undefined,
        })
        .returning()

      return client
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        phoneAreaCode: t.String({ minLength: 1, maxLength: 3 }),
        phoneNumber: t.String({ minLength: 7, maxLength: 11 }),
        city: t.String({ minLength: 1 }),
        status: t.Optional(t.String()),
      }),
    }
  )

  // Edita campos gerais do cliente
  .put(
    "/:id",
    async ({ params, body, error }) => {
      const existing = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, params.id), isNull(clients.deletedAt)))
        .limit(1)

      if (!existing[0]) return error(404, { message: "Client not found" })

      const phoneNumber = normalizePhone(body.phoneNumber)
      if (phoneNumber.length !== 8) {
        return error(400, { message: "Phone number must have 8 digits" })
      }

      const [updated] = await db
        .update(clients)
        .set({
          name: body.name,
          phoneAreaCode: body.phoneAreaCode.replace(/\D/g, "").slice(0, 2),
          phoneNumber,
          city: body.city,
        })
        .where(eq(clients.id, params.id))
        .returning()

      return updated
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        phoneAreaCode: t.String({ minLength: 1, maxLength: 3 }),
        phoneNumber: t.String({ minLength: 7, maxLength: 11 }),
        city: t.String({ minLength: 1 }),
      }),
    }
  )

  // Atualiza apenas o status
  .patch(
    "/:id/status",
    async ({ params, body, error }) => {
      const existing = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, params.id), isNull(clients.deletedAt)))
        .limit(1)

      if (!existing[0]) return error(404, { message: "Client not found" })

      const [updated] = await db
        .update(clients)
        .set({ status: body.status as (typeof CLIENT_STATUS_VALUES)[number] })
        .where(eq(clients.id, params.id))
        .returning()

      return updated
    },
    {
      body: t.Object({
        status: t.String(),
      }),
    }
  )

  // Adiciona ou atualiza o telefone do responsável
  .patch(
    "/:id/responsible",
    async ({ params, body, error }) => {
      const existing = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, params.id), isNull(clients.deletedAt)))
        .limit(1)

      if (!existing[0]) return error(404, { message: "Client not found" })

      const responsiblePhoneNumber = normalizePhone(body.responsiblePhoneNumber)
      if (responsiblePhoneNumber.length !== 8) {
        return error(400, {
          message: "Responsible phone number must have 8 digits",
        })
      }

      const [updated] = await db
        .update(clients)
        .set({
          responsiblePhoneAreaCode: body.responsiblePhoneAreaCode
            .replace(/\D/g, "")
            .slice(0, 2),
          responsiblePhoneNumber,
        })
        .where(eq(clients.id, params.id))
        .returning()

      return updated
    },
    {
      body: t.Object({
        responsiblePhoneAreaCode: t.String({ minLength: 1, maxLength: 3 }),
        responsiblePhoneNumber: t.String({ minLength: 7, maxLength: 11 }),
      }),
    }
  )

  // Soft delete
  .delete("/:id", async ({ params, error }) => {
    const existing = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, params.id), isNull(clients.deletedAt)))
      .limit(1)

    if (!existing[0]) return error(404, { message: "Client not found" })

    await db
      .update(clients)
      .set({ deletedAt: new Date() })
      .where(eq(clients.id, params.id))

    return { success: true }
  })
