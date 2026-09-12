import type { PaymentMethod } from "@/types/finance"

// De-para construído a partir dos extratos NU_675343637 (nov e dez/2025) —
// ver artifact "De-para do extrato". Casa por substring (sem acento, case-insensitive)
// contra a descrição crua do extrato. `categoryName` só é aplicado se existir uma
// categoria com esse nome exato — nunca cria categoria nova automaticamente.
export interface DeparaRule {
  pattern: string
  paymentMethod?: PaymentMethod
  categoryName?: string
}

// Ordem importa: regras mais específicas (LTDA) vêm antes das genéricas
// (nome da pessoa/empresa sozinho) pra não perder o match mais preciso.
export const DEPARA_RULES: DeparaRule[] = [
  {
    pattern: "aplicação rdb",
    paymentMethod: "transfer",
    categoryName: "Investimento",
  },
  {
    pattern: "conceito imobiliaria",
    paymentMethod: "boleto",
    categoryName: "Moradia",
  },
  {
    pattern: "celesc distribuicao",
    paymentMethod: "boleto",
    categoryName: "Moradia",
  },
  { pattern: "aymore credito", paymentMethod: "boleto" },
  { pattern: "pagamento de fatura", paymentMethod: "credit_card" },
  { pattern: "receita federal", paymentMethod: "pix" },
  { pattern: "matheus andre palmieri ltda", paymentMethod: "transfer" },
  { pattern: "matheus andre palmieri", paymentMethod: "transfer" },
  { pattern: "raquel patricia persuhn", paymentMethod: "pix" },
  { pattern: "luiza fernandez ravali", paymentMethod: "pix" },
  { pattern: "eduardo roberto alves", paymentMethod: "pix" },
  { pattern: "robert rautenberg", paymentMethod: "pix" },
]

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

export function matchDepara(description: string): DeparaRule | undefined {
  const normalized = normalize(description)
  return DEPARA_RULES.find((rule) =>
    normalized.includes(normalize(rule.pattern))
  )
}
