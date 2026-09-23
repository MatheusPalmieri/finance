import { sql } from "drizzle-orm"
import { transactions } from "../db/schema"

// Fora das contas sandbox (dados de teste/depuração). É o escopo da listagem
// de histórico, do kNN da classificação e das transações recentes.
export const REAL_TRANSACTIONS = sql`${transactions.accountId} not in (select id from accounts where is_sandbox)`

// Escopo das análises (dashboard, check-up, projeção, recorrências): real e
// `kind = regular`. Pagamento de fatura, aplicação/resgate e transferência
// entre contas próprias são dinheiro mudando de lugar — contá-los duplicaria a
// fatura já detalhada no cartão ou faria uma aplicação parecer gasto.
export const COUNTED_TRANSACTIONS = sql`(${REAL_TRANSACTIONS} and ${transactions.kind} = 'regular')`
