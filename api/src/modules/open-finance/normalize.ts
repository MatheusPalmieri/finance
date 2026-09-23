// Tradução pura do payload da Pluggy para o domínio. Sem I/O — coberto por
// normalize.test.ts. As regras vieram dos dados reais (infra/pluggy-probe.md).

import type {
  PaymentMethod,
  TransactionKind,
  TransactionStatus,
} from "../../db/schema"
import type { ProviderAccountType, ProviderTransaction } from "./types"

export const LOCAL_TIMEZONE = "America/Sao_Paulo"

/**
 * yyyy-mm-dd no fuso de São Paulo. A Pluggy manda ISO em UTC: um Pix feito às
 * 22h cairia no dia seguinte (conferido contra o extrato: 90% → 99% de
 * conciliação só com esta conversão).
 */
export function toLocalDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: LOCAL_TIMEZONE })
}

/**
 * Convenção do domínio: positivo = despesa, negativo = entrada. O sinal de
 * `amount` na Pluggy se inverte entre conta e cartão, mas `type` é consistente
 * nos dois: DEBIT é saída.
 */
export function toDomainAmount(tx: Pick<ProviderTransaction, "amount" | "type">): number {
  const magnitude = Math.abs(Number(tx.amount))
  if (tx.type === "DEBIT") return magnitude
  if (tx.type === "CREDIT") return -magnitude
  // Sem `type`: cai no sinal da própria Pluggy para conta (negativo = saída)
  return -Number(tx.amount)
}

// Categorias da Pluggy que marcam movimento interno
const BILL_PAYMENT_CATEGORY = "05100000" // Credit card payment
const SAME_PERSON_CATEGORY = "04000000" // Same person transfer
const INVESTMENTS_CATEGORY_PREFIX = "03" // Investments e subcategorias

const BILL_PAYMENT_RE = /^pagamento (de fatura|recebido)\b/i
// Formatos do extrato CSV ("Compra de FII") e da Pluggy, que descreve a
// corretora como "Compra de Renda Variável" — e a categoriza como Shopping
const INVESTMENT_RE =
  /^(aplica[cç][aã]o|resgate) rdb\b|^(compra|venda) de (fii|a[cç][oõ]es|bdr|etf|criptomoedas|renda vari[aá]vel)\b/i

/**
 * Natureza do movimento. Só `regular` entra nas análises — ver
 * domain/transaction.md, "Movimentos internos".
 */
export function detectKind(tx: ProviderTransaction): TransactionKind {
  const description = (tx.description ?? "").trim()
  if (tx.categoryId === BILL_PAYMENT_CATEGORY || BILL_PAYMENT_RE.test(description)) {
    return "bill_payment"
  }
  if (INVESTMENT_RE.test(description)) return "investment"
  if (tx.categoryId?.startsWith(INVESTMENTS_CATEGORY_PREFIX)) return "investment"
  if (tx.categoryId === SAME_PERSON_CATEGORY) return "own_transfer"
  return "regular"
}

export function toStatus(tx: ProviderTransaction): TransactionStatus {
  return tx.status === "PENDING" ? "pending" : "posted"
}

/**
 * Forma de pagamento. No cartão é sempre crédito; na conta, vem do
 * `paymentData` quando existe e, senão, do texto do banco.
 */
export function paymentMethodHint(
  tx: ProviderTransaction,
  accountType: ProviderAccountType
): PaymentMethod {
  if (accountType === "CREDIT") return "credit_card"
  switch (tx.paymentData?.paymentMethod) {
    case "PIX":
      return "pix"
    case "BOLETO":
      return "boleto"
    case "TED":
    case "DOC":
      return "transfer"
  }
  const description = (tx.description ?? "").toLowerCase()
  if (description.startsWith("compra no débito") || description.startsWith("compra no debito")) {
    return "debit_card"
  }
  if (description.startsWith("pagamento de boleto")) return "boleto"
  if (detectKind(tx) !== "regular") return "transfer"
  return "pix"
}

/**
 * Nome legível — e também o texto que a classificação recebe. A Pluggy junta
 * tipo e contraparte com "|" ("Transferência enviada|FULANO"); aqui vira o
 * formato do extrato CSV, para as regras e o histórico já existentes valerem:
 * Pix enviado → "Pix para FULANO" (o nome que o importador gravava), o resto
 * → "Tipo - Contraparte" ("Transferência Recebida - EMPRESA LTDA", que a
 * regra de salário reconhece; "Compra de FII - MXRF11").
 */
export function displayName(tx: ProviderTransaction): string {
  const description = (tx.description ?? tx.descriptionRaw ?? "").trim()
  const [kind, counterpart] = description.split("|").map((part) => part.trim())
  if (counterpart) {
    if (/^transfer[eê]ncia enviada/i.test(kind)) return `Pix para ${counterpart}`
    return `${kind} - ${counterpart}`
  }
  return description || "Sem descrição"
}

// Categoria da Pluggy → categoria local (por nome). Prefixo mais longo vence.
// Só é usada quando nenhuma camada da classificação (regra/histórico/IA)
// resolveu a linha — é o sinal extra que a spec 04 prevê.
const PLUGGY_CATEGORY_MAP: [prefix: string, localName: string][] = [
  ["01", "Salário"], // Income
  ["03", "Investimento"],
  ["07010", "Serviços"], // Telecommunications, Internet
  ["07020", "Estudos"], // Education, University, School
  ["07030", "Saúde"], // Wellness and fitness, Gyms
  ["07040", "Lazer"], // Tickets, Cinema, theater and concerts
  ["07", "Serviços"],
  ["08", "Compras"], // Shopping, Clothing, Electronics, Bookstore...
  ["09030", "Música"], // Music streaming
  ["09", "Assinaturas"], // Digital services, Video streaming, Gaming
  ["10", "Alimentação"], // Groceries
  ["11", "Alimentação"], // Eating out, Food delivery
  ["12", "Lazer"], // Travel, Accomodation
  ["16", "Serviços"], // Bank fees
  ["17", "Moradia"], // Housing, Electricity
  ["18", "Saúde"], // Healthcare, Pharmacy, Dentist
  ["19", "Transporte"], // Taxi, Gas, Parking, Public transportation...
  ["21", "Lazer"], // Leisure
]

export function pluggyCategoryToLocalName(categoryId: string | null | undefined): string | null {
  if (!categoryId) return null
  let best: [string, string] | null = null
  for (const entry of PLUGGY_CATEGORY_MAP) {
    if (categoryId.startsWith(entry[0]) && (!best || entry[0].length > best[0].length)) {
      best = entry
    }
  }
  return best?.[1] ?? null
}

/** Tudo que o sync grava a partir de uma transação do provedor. */
export interface NormalizedTransaction {
  externalId: string
  date: string
  amount: number
  status: TransactionStatus
  kind: TransactionKind
  /** Texto cru do banco. */
  description: string
  /** Nome no formato do extrato — é o que a classificação recebe. */
  name: string
  paymentMethod: PaymentMethod
  localCategoryName: string | null
}

export function normalizeTransaction(
  tx: ProviderTransaction,
  accountType: ProviderAccountType
): NormalizedTransaction {
  return {
    externalId: tx.id,
    date: toLocalDate(tx.date),
    amount: toDomainAmount(tx),
    status: toStatus(tx),
    kind: detectKind(tx),
    description: (tx.description ?? tx.descriptionRaw ?? "").trim(),
    name: displayName(tx).slice(0, 255),
    paymentMethod: paymentMethodHint(tx, accountType),
    localCategoryName: pluggyCategoryToLocalName(tx.categoryId),
  }
}
