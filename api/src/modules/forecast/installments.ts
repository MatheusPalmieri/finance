// Matemática de parcelamento. Pura e testada — é o tipo de fórmula que se erra
// em silêncio e só aparece como um número levemente errado no gráfico.

export class InstallmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InstallmentError"
  }
}

/**
 * Valor da parcela.
 *
 * - Sem juros: divisão simples (`total / n`).
 * - Com juros: Tabela Price — `parcela = total * i / (1 - (1+i)^-n)`.
 *
 * `monthlyInterestPct` é em **pontos percentuais ao mês** (2 = 2% a.m.).
 */
export function installmentAmount(
  totalAmount: number,
  installments: number,
  monthlyInterestPct = 0
): number {
  if (!Number.isFinite(totalAmount)) {
    throw new InstallmentError("Valor total inválido")
  }
  if (!Number.isInteger(installments) || installments <= 0) {
    throw new InstallmentError("Número de parcelas deve ser inteiro e maior que zero")
  }
  if (monthlyInterestPct < 0) {
    throw new InstallmentError("Juros não pode ser negativo")
  }

  // À vista não rende juros, mesmo que uma taxa tenha sido informada: é o que
  // "1x" significa para quem preenche o formulário. Sem esta guarda, a Tabela
  // Price cobraria um mês de juros sobre uma compra que não foi financiada.
  if (installments === 1) return totalAmount
  if (monthlyInterestPct === 0) return totalAmount / installments

  const i = monthlyInterestPct / 100
  return (totalAmount * i) / (1 - Math.pow(1 + i, -installments))
}

/** Custo total do parcelamento (parcela × n). Com juros zero, é o próprio total. */
export function totalPaid(
  totalAmount: number,
  installments: number,
  monthlyInterestPct = 0
): number {
  return installmentAmount(totalAmount, installments, monthlyInterestPct) * installments
}
