import { z } from "zod"

export const clientSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(120),
  phoneAreaCode: z
    .string()
    .length(2, "DDD deve ter 2 dígitos")
    .regex(/^\d{2}$/, "Apenas números"),
  phoneNumber: z
    .string()
    .min(7, "Mínimo 7 dígitos")
    .max(9, "Máximo 9 dígitos")
    .regex(/^\d+$/, "Apenas números"),
  city: z.string().min(1, "Cidade obrigatória").max(80),
})

export type ClientFormValues = z.infer<typeof clientSchema>

const CLIENT_PHASES = ["PROSPECTING", "NEGOTIATING", "CLOSED"] as const
const CLOSE_REASONS = [
  "CLIENT",
  "TRIAL",
  "CUSTOM_TRIAL",
  "PRICE_OBJECTION",
  "NO_FIT",
  "GHOST",
  "UNREACHABLE",
] as const

export const phaseSchema = z
  .object({
    phase: z.enum(CLIENT_PHASES),
    closeReason: z.enum(CLOSE_REASONS).optional(),
    messageSent: z.boolean().optional(),
  })
  .refine((data) => data.phase !== "CLOSED" || !!data.closeReason, {
    message: "Motivo de fechamento obrigatório",
    path: ["closeReason"],
  })

export type PhaseFormValues = z.infer<typeof phaseSchema>

export const responsibleSchema = z.object({
  responsiblePhoneAreaCode: z
    .string()
    .length(2, "DDD deve ter 2 dígitos")
    .regex(/^\d{2}$/, "Apenas números"),
  responsiblePhoneNumber: z
    .string()
    .min(7, "Mínimo 7 dígitos")
    .max(9, "Máximo 9 dígitos")
    .regex(/^\d+$/, "Apenas números"),
})

export type ResponsibleFormValues = z.infer<typeof responsibleSchema>
