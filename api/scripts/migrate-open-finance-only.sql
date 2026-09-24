-- Migração: Open Finance como fonte ÚNICA de verdade
-- (ver .claude/docs/decisions/open-finance-fonte-unica.md).
--
-- 1. Remove o que não veio do Open Finance: transações manuais/CSV, as contas
--    que só existiam para elas (sem vínculo com a Pluggy) e o que derivava
--    delas (séries recorrentes e os check-ups dos meses afetados).
-- 2. Tira de `accounts` o saldo digitado, a conta padrão e a flag sandbox.
-- 3. Restringe `transaction_source` a 'open_finance' e torna `external_id`
--    obrigatório.
-- 4. Cria `open_finance_snapshots` (cache persistente de saldos/investimentos).
--
-- Faça backup antes — o passo 1 apaga linhas:
--
--   docker exec finance-postgres-1 pg_dump -U finance -d finance -Fc > finance-antes-of-only.dump
--   docker exec -i finance-postgres-1 psql -U finance -d finance -v ON_ERROR_STOP=1 < api/scripts/migrate-open-finance-only.sql
--
-- Depois dela `bun run db:push` não aponta diferença.

begin;

-- ── 1. Dados que não vieram do Open Finance ─────────────────────────────────
-- Check-ups dos meses que contaram dado manual/CSV: se regeneram ao abrir /reports
delete from monthly_reports r
using (
  select distinct extract(month from t.date)::int as month, extract(year from t.date)::int as year
  from transactions t
  join accounts a on a.id = t.account_id
  where t.source <> 'open_finance' and not a.is_sandbox
) m
where r.month = m.month and r.year = m.year;

delete from pluggy_transactions
where transaction_id in (select id from transactions where source <> 'open_finance');

delete from transactions where source <> 'open_finance';

-- Contas sem vínculo com a Pluggy e já sem transação nenhuma
delete from accounts a
where not exists (select 1 from pluggy_accounts pa where pa.account_id = a.id)
  and not exists (select 1 from transactions t where t.account_id = a.id);

-- Séries são cache derivado de `transactions`: recalculadas no próximo sync.
-- As dispensadas pelo usuário ficam (é preferência, não dado)
delete from recurring_series where not dismissed;

-- ── 2. Colunas de lançamento manual ─────────────────────────────────────────
alter table accounts drop column balance;
alter table accounts drop column is_default;
alter table accounts drop column is_sandbox;
alter table sync_runs drop column adopted;

-- ── 3. Origem única ─────────────────────────────────────────────────────────
alter table transactions alter column source drop default;
alter type transaction_source rename to transaction_source_old;
create type transaction_source as enum ('open_finance');
alter table transactions
  alter column source type transaction_source using source::text::transaction_source;
alter table transactions alter column source set default 'open_finance';
drop type transaction_source_old;

alter table transactions alter column external_id set not null;

-- ── 4. Cache persistente do Open Finance ────────────────────────────────────
create type snapshot_kind as enum ('balances', 'investments');
create table open_finance_snapshots (
  kind snapshot_kind primary key,
  payload jsonb not null,
  fetched_at timestamp not null
);

commit;
