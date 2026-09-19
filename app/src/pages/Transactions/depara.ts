import type { PaymentMethod, Recurrence } from "@/types/finance"

// De-para construído a partir dos extratos NU_675343637 (nov e dez/2025) —
// ver artifact "De-para do extrato". Casa por substring (sem acento, case-insensitive)
// contra a descrição crua do extrato. `categoryName` só é aplicado se existir uma
// categoria com esse nome exato — nunca cria categoria nova automaticamente.
export interface DeparaRule {
  pattern: string
  // Nome exibido na transação no lugar da descrição crua do extrato
  rename?: string | ((description: string) => string)
  paymentMethod?: PaymentMethod
  categoryName?: string
  // Força o tipo da linha, ignorando o sinal do extrato (ex.: Aplicação RDB
  // vem negativa no Nubank, mas pra este usuário é sempre receita)
  isIncome?: boolean
  recurrence?: Recurrence
}

// Pix enviado: "Transferência enviada pelo Pix - NOME - •••.811.569-•• - NU PAGAMENTOS ..."
// O documento (CPF mascarado ou CNPJ) vem logo depois do nome, então o nome é
// tudo entre o primeiro " - " e o " - " seguido de dígitos/máscara.
const PIX_SENT_RE =
  /^transfer[eê]ncia enviada pelo pix - (.+?) - [•*\d./-]+ - /i

function pixRecipient(description: string): string {
  const name = PIX_SENT_RE.exec(description)?.[1]?.trim()
  return name ? `Pix para ${name}` : description
}

// Ordem importa: regras mais específicas vêm antes das genéricas pra não
// perder o match mais preciso (ex.: salário antes de "matheus andre palmieri
// ltda" e as transferências entre contas próprias antes do Pix genérico).
export const DEPARA_RULES: DeparaRule[] = [
  {
    pattern: "aplicação rdb",
    paymentMethod: "transfer",
    categoryName: "Investimento",
    isIncome: true,
    recurrence: "variable",
  },
  {
    pattern: "transferencia recebida - matheus andre palmieri ltda",
    rename: "Salário",
    paymentMethod: "transfer",
    categoryName: "Salário",
  },
  {
    pattern: "conceito imobiliaria",
    rename: "Aluguel",
    paymentMethod: "boleto",
    categoryName: "Moradia",
  },
  {
    pattern: "celesc distribuicao",
    rename: "Conta de luz",
    paymentMethod: "boleto",
    categoryName: "Moradia",
  },
  {
    pattern: "aymore credito",
    rename: "Financiamento do carro",
    paymentMethod: "boleto",
    categoryName: "Transporte",
  },
  {
    pattern: "alles imoveis",
    rename: "Aluguel",
    paymentMethod: "boleto",
    categoryName: "Moradia",
  },
  {
    pattern: "edificio ilha de cozumel",
    rename: "Condomínio",
    paymentMethod: "boleto",
    categoryName: "Moradia",
  },
  {
    pattern: "resgate rdb",
    paymentMethod: "transfer",
    categoryName: "Investimento",
    recurrence: "variable",
  },
  {
    // Rendimento em centavos, vem várias vezes por mês
    pattern: "credito em conta",
    rename: "Rendimento",
    paymentMethod: "transfer",
    categoryName: "Investimento",
  },
  // Compra/venda de ativos na corretora do Nubank — nome mantém o ticker
  ...[
    "compra de fii",
    "compra de acoes",
    "compra de bdr",
    "compra de etf",
    "compra de criptomoedas",
    "venda de criptomoedas",
  ].map(
    (pattern): DeparaRule => ({
      pattern,
      paymentMethod: "transfer",
      categoryName: "Investimento",
    })
  ),
  { pattern: "compra no debito", paymentMethod: "debit_card" },
  { pattern: "pagamento de fatura", paymentMethod: "credit_card" },
  { pattern: "matheus andre palmieri ltda", paymentMethod: "transfer" },
  { pattern: "matheus andre palmieri", paymentMethod: "transfer" },
  {
    pattern: "transferencia enviada pelo pix",
    rename: pixRecipient,
    paymentMethod: "pix",
  },
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

// Nome final da transação: aplica o `rename` da regra (se houver) ou mantém
// a descrição crua do extrato
export function resolveName(rule: DeparaRule | undefined, description: string) {
  if (!rule?.rename) return description
  return typeof rule.rename === "function"
    ? rule.rename(description)
    : rule.rename
}
