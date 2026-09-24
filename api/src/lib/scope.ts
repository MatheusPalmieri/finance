import { sql } from "drizzle-orm"
import { transactions } from "../db/schema"

// Só o que veio do Open Finance — a única fonte de verdade. Toda transação hoje
// nasce do sync, mas o filtro explícito garante que nada de fora (um insert à
// mão no Postgres, um resto de dado antigo) apareça em tela ou em análise.
export const REAL_TRANSACTIONS = sql`${transactions.source} = 'open_finance'`

// Escopo das análises (dashboard, check-up, projeção, recorrências): Open
// Finance e `kind = regular`. Pagamento de fatura, aplicação/resgate e
// transferência entre contas próprias são dinheiro mudando de lugar — contá-los
// duplicaria a fatura já detalhada no cartão ou faria uma aplicação parecer gasto.
export const COUNTED_TRANSACTIONS = sql`(${REAL_TRANSACTIONS} and ${transactions.kind} = 'regular')`
