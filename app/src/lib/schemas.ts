import { z } from "zod"

const CLIENT_STATUSES = [
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
] as const

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
  status: z.enum(CLIENT_STATUSES),
})

export type ClientFormValues = z.infer<typeof clientSchema>

export const statusSchema = z.object({
  status: z.enum(CLIENT_STATUSES),
})

export type StatusFormValues = z.infer<typeof statusSchema>

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
