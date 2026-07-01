---
title: Domínio — Transação
area: domain
updated: 2026-07-01
---

## Visão geral

A transação é o módulo central do sistema. Não há campo `type` nem entidade de transferência — a distinção entre despesa e entrada é feita pelo **sinal de `amount`** (positivo = despesa, negativo = entrada). O modelo gira em torno de classificar gastos, com entradas tratadas como caso especial (ver "Entradas" abaixo).

## Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | uuid | — | PK gerada |
| `name` | varchar(255) | sim | Nome/descrição curta |
| `amount` | numeric(10,2) | sim | Valor em reais. Positivo = despesa; negativo = entrada (ver "Entradas") |
| `categoryId` | uuid FK → categories | sim | Categoria do gasto |
| `paymentMethodId` | uuid FK → payment_methods | sim | Forma de pagamento |
| `accountId` | uuid FK → accounts | sim | Conta de onde saiu o dinheiro |
| `isEssential` | boolean | sim | Gasto essencial (`true`) ou não (`false`) |
| `recurrence` | enum `fixed` \| `variable` | sim | Gasto fixo (recorrente) ou variável (pontual) |
| `budgetId` | uuid FK → budgets | condicional | Orçamento vinculado — obrigatório se `recurrence = fixed`; nulo se `variable`. Ver `.claude/docs/domain/budget.md` |
| `date` | date | sim | Data do gasto (default: `CURRENT_DATE`) |
| `notes` | text | não | Observação livre (nullable) |

`createdAt` / `updatedAt` são gerenciados automaticamente.

> **Decisão técnica — "usar Contas em vez de Bancos":** o requisito original pedia `bank_id`, mas optou-se por referenciar o módulo de **Contas (accounts)**. O `is_default` ficou em `accounts`, e o módulo **Bancos** permanece como cadastro avulso, sem ligação com transações.

## Regras de negócio

### Entradas (receita pontual)
Adicionado em 2026-07-01. Não existe campo `type`: o formulário (`app/src/pages/Transactions/index.tsx`) tem um botão redondo ao lado do campo "Valor" que alterna `isIncome` (estado só de UI, nunca enviado à API). No submit, o valor digitado (sempre positivo no input) é invertido para negativo quando `isIncome = true` — é esse `amount` com sinal que vai para a API.
- `amount > 0` → despesa (ícone `ArrowDownRight`, vermelho `FINANCE.expense`)
- `amount < 0` → entrada (ícone `ArrowUpRight`, verde `FINANCE.income`)
- A listagem de transações e "Recentes" (Home) exibem o sinal e a cor conforme o valor de `amount`, usando `Math.abs()` para formatar.
- `GET /dashboard/summary` continua sendo um **painel só de despesas**: toda agregação (`totalExpenses`, por categoria, por forma de pagamento, por conta, tendência mensal) filtra `amount > 0` (constante `isExpense` em `api/src/routes/dashboard.ts`), então entradas não distorcem essas métricas. `recentTransactions` não é filtrado — mostra despesas e entradas juntas.
- Zero não é um valor válido (`amount === 0` retorna 400 em POST/PUT).

### Efeito no saldo da conta
`adjustBalance()` (`api/src/routes/transactions.ts`) sempre **subtrai** `amount` do `balance`; como subtrair um valor negativo soma, a mesma função cobre despesa e entrada sem `if`:
- **Criar** → subtrai `amount` do saldo (soma, se `amount` for negativo).
- **Editar** → devolve o valor antigo à conta antiga (soma `amount` antigo) e subtrai o novo da conta nova.
- **Excluir** → devolve o valor ao saldo (soma `amount`).

### Conta padrão (`accounts.isDefault`)
- Apenas **uma** conta pode ser padrão por vez. Ao marcar uma como padrão (criar/editar), as demais são desmarcadas (`unsetOtherDefaults` em `api/src/routes/accounts.ts`).
- O formulário de transação pré-preenche `accountId` com a conta padrão (`GET /accounts/default`).
- O campo `date` do formulário é pré-preenchido com a data de hoje.

## Impacto da migração (modelo antigo → novo)

O modelo antigo (`type` INCOME/EXPENSE/TRANSFER, `description`, `toAccountId`) foi **substituído por completo**. Consequências:
- **Dashboard** (`/dashboard/summary`) virou painel de despesas: total, essencial vs não-essencial, fixo vs variável, por categoria, por forma de pagamento e por conta. Não há mais receita, patrimônio nem taxa de poupança.
- **Categorias** não têm mais `type`; a seleção no formulário lista todas.
- **Bancos** deixaram de ser referenciados por transações.
