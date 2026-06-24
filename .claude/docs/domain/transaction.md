---
title: Domínio — Transação
area: domain
updated: 2026-06-23
---

## Visão geral

A transação é o módulo central do sistema. **Toda transação é uma despesa** — não há mais receita, transferência nem campo `type`. O modelo gira em torno de classificar gastos.

## Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | uuid | — | PK gerada |
| `name` | varchar(255) | sim | Nome/descrição curta |
| `amount` | numeric(10,2) | sim | Valor em reais (positivo) |
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

### Efeito no saldo da conta
Como toda transação é uma despesa, ela **subtrai** `amount` do `balance` da `accounts` escolhida:
- **Criar** → subtrai do saldo.
- **Editar** → devolve o valor antigo à conta antiga e subtrai o novo da conta nova.
- **Excluir** → devolve o valor ao saldo.

Lógica em `adjustBalance()` (`api/src/routes/transactions.ts`).

### Conta padrão (`accounts.isDefault`)
- Apenas **uma** conta pode ser padrão por vez. Ao marcar uma como padrão (criar/editar), as demais são desmarcadas (`unsetOtherDefaults` em `api/src/routes/accounts.ts`).
- O formulário de transação pré-preenche `accountId` com a conta padrão (`GET /accounts/default`).
- O campo `date` do formulário é pré-preenchido com a data de hoje.

## Impacto da migração (modelo antigo → novo)

O modelo antigo (`type` INCOME/EXPENSE/TRANSFER, `description`, `toAccountId`) foi **substituído por completo**. Consequências:
- **Dashboard** (`/dashboard/summary`) virou painel de despesas: total, essencial vs não-essencial, fixo vs variável, por categoria, por forma de pagamento e por conta. Não há mais receita, patrimônio nem taxa de poupança.
- **Categorias** não têm mais `type`; a seleção no formulário lista todas.
- **Bancos** deixaram de ser referenciados por transações.
