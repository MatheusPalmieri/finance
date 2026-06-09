import { pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core"

export const clientPhaseEnum = pgEnum("client_phase", [
  "PROSPECTING",
  "NEGOTIATING",
  "CLOSED",
])

export const closeReasonEnum = pgEnum("close_reason", [
  // won
  "CLIENT",
  "TRIAL",
  "CUSTOM_TRIAL",
  // lost
  "PRICE_OBJECTION",
  "NO_FIT",
  "GHOST",
  "UNREACHABLE",
])

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  // DDD (código de área) — sempre 2 dígitos
  phoneAreaCode: varchar("phone_area_code", { length: 2 }).notNull(),
  // Número sem o 9 inicial — sempre 8 dígitos para compatibilidade com automações
  phoneNumber: varchar("phone_number", { length: 8 }).notNull(),
  responsiblePhoneAreaCode: varchar("responsible_phone_area_code", { length: 2 }),
  responsiblePhoneNumber: varchar("responsible_phone_number", { length: 8 }),
  city: varchar("city", { length: 255 }).notNull(),
  phase: clientPhaseEnum("phase").default("PROSPECTING").notNull(),
  closeReason: closeReasonEnum("close_reason"),
  messageSentAt: timestamp("message_sent_at"),
  negotiatingStartedAt: timestamp("negotiating_started_at"),
  closedAt: timestamp("closed_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})

export type Client = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
export type ClientPhase = (typeof clientPhaseEnum.enumValues)[number]
export type CloseReason = (typeof closeReasonEnum.enumValues)[number]
