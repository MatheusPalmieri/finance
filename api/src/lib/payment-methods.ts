import type { PaymentMethod } from "../db/schema"

// Lista fixa do sistema (não é mais CRUD do usuário) — nomes/cores espelham
// o que a UI mostrava antes de virar enum. Mudar aqui também exige migrar o
// enum `payment_method` no banco (ver .claude/docs/domain/transaction.md).
export const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "pix",
  "credit_card",
  "debit_card",
  "boleto",
  "transfer",
]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  boleto: "Boleto",
  transfer: "Transferência",
}

export const PAYMENT_METHOD_HEX: Record<PaymentMethod, string> = {
  cash: "#10b981",
  pix: "#06b6d4",
  credit_card: "#ef4444",
  debit_card: "#3b82f6",
  boleto: "#f59e0b",
  transfer: "#8b5cf6",
}

export function isPaymentMethod(v: string): v is PaymentMethod {
  return (PAYMENT_METHODS as string[]).includes(v)
}
