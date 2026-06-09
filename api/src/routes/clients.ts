import { Elysia, t } from "elysia"
import { and, desc, eq, ilike, isNull, isNotNull, or, sql } from "drizzle-orm"
import { db } from "../db"
import { clientPhaseEnum, closeReasonEnum, clients } from "../db/schema"
import { normalizePhone } from "../lib/phone"

const CLIENT_PHASE_VALUES = clientPhaseEnum.enumValues
const CLOSE_REASON_VALUES = closeReasonEnum.enumValues

// Mapeia o filtro de janela de criação para uma quantidade de dias
const CREATED_WITHIN_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
}

export const clientsRoute = new Elysia({ prefix: "/clients" })
  // Lista clientes com paginação, busca e filtros (fase, motivo, cidade,
  // contato, responsável, janela de criação e flag de duplicatas)
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

      if (query.phase) {
        conditions.push(eq(clients.phase, query.phase as (typeof CLIENT_PHASE_VALUES)[number]))
      }

      if (query.closeReason) {
        conditions.push(
          eq(
            clients.closeReason,
            query.closeReason as (typeof CLOSE_REASON_VALUES)[number]
          )
        )
      }

      if (query.city) {
        conditions.push(eq(clients.city, query.city))
      }

      // Contatado = já teve mensagem enviada
      if (query.contacted === "true") {
        conditions.push(isNotNull(clients.messageSentAt))
      } else if (query.contacted === "false") {
        conditions.push(isNull(clients.messageSentAt))
      }

      // Possui telefone de responsável cadastrado
      if (query.hasResponsible === "true") {
        conditions.push(isNotNull(clients.responsiblePhoneNumber))
      } else if (query.hasResponsible === "false") {
        conditions.push(isNull(clients.responsiblePhoneNumber))
      }

      // Janela de criação relativa (últimos N dias)
      const createdWithinDays = query.createdWithin
        ? CREATED_WITHIN_DAYS[query.createdWithin]
        : undefined
      if (createdWithinDays) {
        conditions.push(
          sql`${clients.createdAt} >= now() - make_interval(days => ${createdWithinDays})`
        )
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
            phase: clients.phase,
            closeReason: clients.closeReason,
            messageSentAt: clients.messageSentAt,
            negotiatingStartedAt: clients.negotiatingStartedAt,
            closedAt: clients.closedAt,
            deletedAt: clients.deletedAt,
            createdAt: clients.createdAt,
            updatedAt: clients.updatedAt,
            hasDuplicate: hasDuplicateSql,
          })
          .from(clients)
          .where(and(...conditions))
          .orderBy(desc(clients.createdAt))
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
        phase: t.Optional(t.String()),
        closeReason: t.Optional(t.String()),
        city: t.Optional(t.String()),
        contacted: t.Optional(t.String()),
        hasResponsible: t.Optional(t.String()),
        createdWithin: t.Optional(t.String()),
        duplicates: t.Optional(t.String()),
      }),
    }
  )

  // Lista distinta de cidades cadastradas — alimenta o dropdown de filtro
  .get("/cities", async () => {
    const rows = await db
      .selectDistinct({ city: clients.city })
      .from(clients)
      .where(isNull(clients.deletedAt))
      .orderBy(clients.city)

    return rows.map((r) => r.city)
  })

  // Agrega métricas para o dashboard do funil (filtra por período e cidade)
  .get(
    "/stats",
    async ({ query }) => {
      const period = query.period ?? "30d"
      const days =
        period === "7d"
          ? 7
          : period === "90d"
            ? 90
            : period === "all"
              ? null
              : 30

      const conditions = [isNull(clients.deletedAt)]
      if (days !== null) {
        conditions.push(
          sql`${clients.createdAt} >= now() - make_interval(days => ${days})`
        )
      }
      if (query.city) {
        conditions.push(eq(clients.city, query.city))
      }
      const where = and(...conditions)

      const [phaseRows, closeReasonRows, [{ contacted }], cityRows, timelineRows, cityList] =
        await Promise.all([
          // Contagem por fase
          db
            .select({
              phase: clients.phase,
              count: sql<number>`count(*)::int`,
            })
            .from(clients)
            .where(where)
            .groupBy(clients.phase),
          // Contagem por motivo de fechamento (apenas clientes fechados)
          db
            .select({
              closeReason: clients.closeReason,
              count: sql<number>`count(*)::int`,
            })
            .from(clients)
            .where(and(where, isNotNull(clients.closeReason)))
            .groupBy(clients.closeReason),
          // Contatados: mensagem enviada
          db
            .select({ contacted: sql<number>`count(*)::int` })
            .from(clients)
            .where(and(where, isNotNull(clients.messageSentAt))),
          // Top cidades dentro do filtro
          db
            .select({
              city: clients.city,
              count: sql<number>`count(*)::int`,
            })
            .from(clients)
            .where(where)
            .groupBy(clients.city)
            .orderBy(sql`count(*) desc`)
            .limit(8),
          // Série temporal: leads criados por dia
          db
            .select({
              date: sql<string>`to_char(${clients.createdAt}, 'YYYY-MM-DD')`,
              count: sql<number>`count(*)::int`,
            })
            .from(clients)
            .where(where)
            .groupBy(sql`to_char(${clients.createdAt}, 'YYYY-MM-DD')`)
            .orderBy(sql`to_char(${clients.createdAt}, 'YYYY-MM-DD')`),
          // Lista global de cidades (independe do filtro) para o dropdown
          db
            .selectDistinct({ city: clients.city })
            .from(clients)
            .where(isNull(clients.deletedAt))
            .orderBy(clients.city),
        ])

      const phaseCounts = Object.fromEntries(
        CLIENT_PHASE_VALUES.map((p) => [p, 0])
      ) as Record<(typeof CLIENT_PHASE_VALUES)[number], number>

      let total = 0
      for (const row of phaseRows) {
        phaseCounts[row.phase] = row.count
        total += row.count
      }

      const closeReasonCounts: Partial<Record<(typeof CLOSE_REASON_VALUES)[number], number>> = {}
      for (const row of closeReasonRows) {
        if (row.closeReason) closeReasonCounts[row.closeReason] = row.count
      }

      return {
        total,
        phaseCounts,
        closeReasonCounts,
        contacted,
        byCity: cityRows,
        timeline: timelineRows,
        cities: cityList.map((c) => c.city),
      }
    },
    {
      query: t.Object({
        period: t.Optional(t.String()),
        city: t.Optional(t.String()),
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

  // Cria um novo cliente — opcionalmente já com fase/motivo definidos
  .post(
    "/",
    async ({ body, error }) => {
      const phoneNumber = normalizePhone(body.phoneNumber)

      if (phoneNumber.length !== 8) {
        return error(400, { message: "Phone number must have 8 digits" })
      }

      const phase =
        (body.phase as (typeof CLIENT_PHASE_VALUES)[number]) ?? "PROSPECTING"

      if (phase === "CLOSED" && !body.closeReason) {
        return error(400, { message: "Close reason required when phase is CLOSED" })
      }

      const values: typeof clients.$inferInsert = {
        name: body.name,
        phoneAreaCode: body.phoneAreaCode.replace(/\D/g, "").slice(0, 2),
        phoneNumber,
        city: body.city,
        phase,
        closeReason:
          phase === "CLOSED"
            ? (body.closeReason as (typeof CLOSE_REASON_VALUES)[number])
            : null,
      }

      // Carimba os timestamps de transição coerentes com a fase inicial
      if (phase === "NEGOTIATING") values.negotiatingStartedAt = new Date()
      if (phase === "CLOSED") values.closedAt = new Date()
      if (body.messageSent) values.messageSentAt = new Date()

      const [client] = await db.insert(clients).values(values).returning()

      return client
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        phoneAreaCode: t.String({ minLength: 1, maxLength: 3 }),
        phoneNumber: t.String({ minLength: 7, maxLength: 11 }),
        city: t.String({ minLength: 1 }),
        phase: t.Optional(t.String()),
        closeReason: t.Optional(t.String()),
        messageSent: t.Optional(t.Boolean()),
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

  // Atualiza fase do cliente e define timestamps de transição automaticamente
  .patch(
    "/:id/phase",
    async ({ params, body, error }) => {
      const existing = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, params.id), isNull(clients.deletedAt)))
        .limit(1)

      if (!existing[0]) return error(404, { message: "Client not found" })

      const current = existing[0]
      const updates: Partial<typeof clients.$inferInsert> = {
        phase: body.phase as (typeof CLIENT_PHASE_VALUES)[number],
        closeReason:
          body.phase === "CLOSED"
            ? (body.closeReason as (typeof CLOSE_REASON_VALUES)[number])
            : null,
      }

      if (body.phase === "NEGOTIATING" && current.phase !== "NEGOTIATING") {
        updates.negotiatingStartedAt = new Date()
      }
      if (body.phase === "CLOSED" && current.phase !== "CLOSED") {
        updates.closedAt = new Date()
      }
      if (body.messageSent && !current.messageSentAt) {
        updates.messageSentAt = new Date()
      }

      const [updated] = await db
        .update(clients)
        .set(updates)
        .where(eq(clients.id, params.id))
        .returning()

      return updated
    },
    {
      body: t.Object({
        phase: t.String(),
        closeReason: t.Optional(t.String()),
        messageSent: t.Optional(t.Boolean()),
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
