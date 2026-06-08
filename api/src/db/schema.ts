import { pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core"

export const clientStatusEnum = pgEnum("client_status", [
  "NOT_STARTED",
  "MESSAGE_SENT",
  "NEGOTIATING",
  "HAS_SYSTEM",
  "NO_RESPONSE",
  "REJECTED",
  "DISLIKED",
  "TRIAL",
  "CUSTOM_TRIAL",
  "INVALID_CONTACT",
])

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  // DDD (código de área) — sempre 2 dígitos
  phoneAreaCode: varchar("phone_area_code", { length: 2 }).notNull(),
  // Número sem o 9 inicial — sempre 8 dígitos para compatibilidade com automações
  phoneNumber: varchar("phone_number", { length: 8 }).notNull(),
  responsiblePhoneAreaCode: varchar("responsible_phone_area_code", {
    length: 2,
  }),
  responsiblePhoneNumber: varchar("responsible_phone_number", { length: 8 }),
  city: varchar("city", { length: 255 }).notNull(),
  status: clientStatusEnum("status").default("NOT_STARTED").notNull(),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})

export type Client = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
export type ClientStatus = (typeof clientStatusEnum.enumValues)[number]
