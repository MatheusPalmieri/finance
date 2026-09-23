-- Migração única: remove as carteiras e cria a conta sandbox "Claude".
-- Ver .claude/docs/decisions/remocao-carteiras.md
--
-- Rodar UMA vez no banco de desenvolvimento (tudo numa transação):
--   docker exec -i finance-postgres-1 psql -U finance -d finance -v ON_ERROR_STOP=1 < api/scripts/migrate-remove-wallets.sql
--
-- Depois, `bun run db:push` não deve apontar diferença nenhuma.
-- O banco de teste não precisa disto: `bun run test:db` aplica o schema novo.

begin;

alter table accounts add column is_sandbox boolean not null default false;

insert into accounts (name, type, balance, color, icon, is_default, is_sandbox)
values ('Claude', 'CHECKING', 0, '#d97757', 'wallet', false, true);

-- Dados de teste saem da carteira "Claude" para a conta sandbox "Claude"
update transactions
set account_id = (select id from accounts where name = 'Claude' and is_sandbox)
where wallet_id = (select id from wallets where name = 'Claude');

-- O escopo real era a carteira "teste": seus relatórios e séries viram os
-- globais. Os dos outros escopos (global vazio, "Carteira Pessoal", "Claude")
-- saem para não colidir no índice único novo.
delete from monthly_reports
where wallet_id is distinct from (select id from wallets where name = 'teste');
delete from recurring_series
where wallet_id is distinct from (select id from wallets where name = 'teste');

drop index if exists recurring_series_merchant_wallet_uq;
drop index if exists monthly_reports_period_wallet_uq;

alter table transactions drop column wallet_id;
alter table recurring_series drop column wallet_id;
alter table monthly_reports drop column wallet_id;
drop table wallets;

create unique index recurring_series_merchant_uq on recurring_series (merchant_key);
create unique index monthly_reports_period_uq on monthly_reports (month, year);

commit;
