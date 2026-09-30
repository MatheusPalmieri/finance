-- Migração única: orçamento por categoria, grupo 50/30/20 na categoria e fim
-- de recorrência/essencial/vínculo por transação.
-- Ver .claude/docs/decisions/orcamento-por-categoria.md
--
-- Backup antes (fica em backups/, ignorado pelo git):
--   docker exec finance-postgres-1 pg_dump -U finance -d finance -Fc > backups/<nome>.dump
--
-- Rodar UMA vez no banco de desenvolvimento (tudo numa transação):
--   docker exec -i finance-postgres-1 psql -U finance -d finance -v ON_ERROR_STOP=1 < api/scripts/migrate-budgets-by-category.sql
--
-- Depois, `bun run db:push` não deve apontar diferença nenhuma.
-- O banco de teste não precisa disto: `bun run test:db` aplica o schema novo.

begin;

-- ── 1. Grupo 50/30/20 na categoria ───────────────────────────────────────────
create type spending_group as enum ('essential', 'variable', 'investment');
alter table categories add column "group" spending_group not null default 'variable';

update categories set "group" = 'essential'
where name in ('Moradia', 'Transporte', 'Saúde', 'Estudos', 'Serviços');
update categories set "group" = 'investment' where name = 'Investimento';

-- Mercado sai de Alimentação: supermercado é essencial, comer fora é variável
insert into categories (name, color, "group")
select 'Mercado', '#eab308', 'essential'
where not exists (select 1 from categories where name = 'Mercado');

update classification_rules
set category_id = (select id from categories where name = 'Mercado')
where source = 'seed'
  and match_type = 'contains'
  and pattern in ('giassi', 'bistek', 'angeloni', 'supermercado meschke',
                  'fort atacadista', 'cooper filial blumenau');

-- Só o que ainda está em Alimentação: o que o usuário já moveu fica onde está
update transactions
set category_id = (select id from categories where name = 'Mercado')
where category_id = (select id from categories where name = 'Alimentação')
  and lower(original_name) ~ '(giassi|bistek|angeloni|supermercado meschke|fort atacadista|cooper filial blumenau)';

-- ── 2. Orçamentos viram o plano da categoria ─────────────────────────────────
-- Categoria de cada orçamento antigo: a da regra que o vinculava, senão a das
-- transações vinculadas; "Combustível" não tinha nenhuma das duas.
create temporary table budget_category on commit drop as
select
  b.id as budget_id,
  coalesce(
    (select r.category_id from classification_rules r
      where r.budget_id = b.id and r.category_id is not null limit 1),
    (select t.category_id from transactions t
      where t.budget_id = b.id group by t.category_id order by count(*) desc limit 1),
    case when b.name = 'Combustível'
      then (select id from categories where name = 'Transporte') end
  ) as category_id,
  b.amount_type::text as amount_type,
  b.amount, b.amount_min, b.amount_max
from budgets b;

do $$
begin
  if exists (select 1 from budget_category where category_id is null) then
    raise exception 'orçamento sem categoria: %',
      (select string_agg(b.name, ', ') from budgets b
        join budget_category bc on bc.budget_id = b.id where bc.category_id is null);
  end if;
end $$;

-- Soma por categoria: só valores exatos → exato; se houver faixa → faixa
-- (mínimo e máximo somam o exato dos demais itens)
create temporary table category_plan on commit drop as
select
  category_id,
  bool_or(amount_type = 'variable') as is_range,
  sum(coalesce(amount, 0)) as exact_total,
  sum(coalesce(amount, amount_min)) as min_total,
  sum(coalesce(amount, amount_max)) as max_total
from budget_category
group by category_id;

-- Vínculos por transação e por regra deixam de existir
alter table transactions drop column budget_id;
alter table classification_rules drop column budget_id;

delete from budgets;
alter table budgets drop column name;
alter table budgets drop column type;
alter table budgets add column category_id uuid not null;
alter table budgets add constraint budgets_category_id_categories_id_fk
  foreign key (category_id) references categories(id) on delete cascade;
alter table budgets add constraint budgets_category_id_unique unique (category_id);

alter type budget_amount_type rename value 'fixed' to 'exact';
alter type budget_amount_type rename value 'variable' to 'range';

insert into budgets (category_id, amount_type, amount, amount_min, amount_max)
select
  category_id,
  (case when is_range then 'range' else 'exact' end)::budget_amount_type,
  case when is_range then null else exact_total end,
  case when is_range then min_total end,
  case when is_range then max_total end
from category_plan;

-- ── 3. Fim de recorrência e essencial por transação ──────────────────────────
alter table transactions drop column recurrence;
alter table transactions drop column is_essential;
alter table classification_rules drop column recurrence;
alter table classification_rules drop column is_essential;
alter table classification_rules drop column force_income;
drop type recurrence;
drop type budget_type;

-- ── 4. Caches no formato antigo ──────────────────────────────────────────────
-- O check-up guarda as métricas em JSON (orçamentos por item, grupo "desire").
-- É derivado das transações: apaga e gera de novo (bun run report:monthly).
delete from monthly_reports;

commit;
