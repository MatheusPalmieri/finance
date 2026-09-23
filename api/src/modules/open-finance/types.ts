// Tipos do provedor de Open Finance, no formato da Pluggy (único provedor
// real). Só os campos que o módulo lê — o payload inteiro vai cru para
// `pluggy_transactions.payload`.

export interface ProviderItem {
  id: string
  status?: string | null
  executionStatus?: string | null
  lastUpdatedAt?: string | null
  connector?: { id?: number; name?: string } | null
}

/** BANK = conta corrente/poupança; CREDIT = cartão de crédito. */
export type ProviderAccountType = "BANK" | "CREDIT"

export interface ProviderAccount {
  id: string
  itemId?: string
  type: ProviderAccountType
  subtype?: string | null
  name?: string | null
  marketingName?: string | null
  number?: string | null
  balance?: number | null
  currencyCode?: string | null
  creditData?: {
    creditLimit?: number | null
    availableCreditLimit?: number | null
    balanceDueDate?: string | null
    balanceCloseDate?: string | null
    minimumPayment?: number | null
  } | null
}

export interface ProviderTransaction {
  id: string
  accountId?: string
  /** ISO em UTC — converter para America/Sao_Paulo (ver normalize.ts). */
  date: string
  description?: string | null
  descriptionRaw?: string | null
  /** Sinal depende da conta: use `type`, que é consistente nas duas. */
  amount: number
  type?: "DEBIT" | "CREDIT" | null
  status?: "PENDING" | "POSTED" | string | null
  category?: string | null
  categoryId?: string | null
  creditCardMetadata?: {
    installmentNumber?: number | null
    totalInstallments?: number | null
    totalAmount?: number | null
    purchaseDate?: string | null
    billForecastDate?: string | null
    payeeMCC?: number | null
    cardNumber?: string | null
  } | null
  paymentData?: {
    paymentMethod?: string | null
  } | null
  [key: string]: unknown
}

export interface ProviderInvestment {
  id: string
  type?: string | null // FIXED_INCOME | MUTUAL_FUND | EQUITY | ETF | SECURITY | COE
  subtype?: string | null
  status?: string | null // ACTIVE | PENDING | TOTAL_WITHDRAWAL
  name?: string | null
  code?: string | null
  balance?: number | null
  amount?: number | null
  amountOriginal?: number | null
  amountWithdrawal?: number | null
  taxes?: number | null
  taxes2?: number | null
  quantity?: number | null
  value?: number | null
  rate?: number | null
  rateType?: string | null
  dueDate?: string | null
  gracePeriodDate?: string | null
  issuer?: string | null
  date?: string | null
}

export interface ProviderInvestmentTransaction {
  id: string
  type?: string | null // BUY | SELL | TAX | TRANSFER | INTEREST
  amount?: number | null
  netAmount?: number | null
  quantity?: number | null
  value?: number | null
  date?: string | null
}

export interface ListTransactionsOptions {
  /** yyyy-mm-dd. Sem ele, a Pluggy devolve a janela padrão. */
  from?: string
}
