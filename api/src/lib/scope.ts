import { sql } from "drizzle-orm"
import { transactions } from "../db/schema"

// Escopo das análises: toda transação real. As de contas sandbox (dados de
// teste/depuração) aparecem na listagem, mas nunca entram em dashboard,
// check-up, projeção, classificação por histórico nem detecção de recorrências.
export const REAL_TRANSACTIONS = sql`${transactions.accountId} not in (select id from accounts where is_sandbox)`
