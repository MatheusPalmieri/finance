-- Migração única da F1 do Open Finance (spec 04): enums, colunas novas em
-- `transactions` e as tabelas do sync. DDL gerada pelo drizzle-kit a partir de
-- src/db/schema.ts — depois dela `bun run db:push` não aponta diferença.
--
--   docker exec -i finance-postgres-1 psql -U finance -d finance -v ON_ERROR_STOP=1 < api/scripts/migrate-open-finance.sql
--
-- Não usar `db:push --force` para isto: a restrição única nova em
-- `transactions.external_id` faz o drizzle-kit oferecer truncar a tabela.

begin;

CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'success', 'error');

CREATE TYPE "public"."sync_trigger" AS ENUM('manual', 'stale', 'cli');

CREATE TYPE "public"."transaction_kind" AS ENUM('regular', 'bill_payment', 'investment', 'own_transfer');

CREATE TYPE "public"."transaction_source" AS ENUM('manual', 'csv', 'open_finance');

CREATE TYPE "public"."transaction_status" AS ENUM('posted', 'pending');

CREATE TABLE "pluggy_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pluggy_item_id" uuid NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"account_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"subtype" varchar(40),
	"name" varchar(255),
	"number" varchar(60),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pluggy_accounts_provider_account_id_unique" UNIQUE("provider_account_id")
);

CREATE TABLE "pluggy_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar(255) NOT NULL,
	"connector_name" varchar(255),
	"status" varchar(40),
	"execution_status" varchar(60),
	"provider_updated_at" timestamp,
	"last_synced_at" timestamp,
	"last_full_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pluggy_items_item_id_unique" UNIQUE("item_id")
);

CREATE TABLE "pluggy_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_transaction_id" varchar(255) NOT NULL,
	"pluggy_account_id" uuid NOT NULL,
	"transaction_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pluggy_transactions_provider_transaction_id_unique" UNIQUE("provider_transaction_id")
);

CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" "sync_trigger" NOT NULL,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"full" boolean DEFAULT false NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"adopted" integer DEFAULT 0 NOT NULL,
	"removed" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);

ALTER TABLE "pluggy_accounts" ADD CONSTRAINT "pluggy_accounts_pluggy_item_id_pluggy_items_id_fk" FOREIGN KEY ("pluggy_item_id") REFERENCES "public"."pluggy_items"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "pluggy_accounts" ADD CONSTRAINT "pluggy_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "pluggy_transactions" ADD CONSTRAINT "pluggy_transactions_pluggy_account_id_pluggy_accounts_id_fk" FOREIGN KEY ("pluggy_account_id") REFERENCES "public"."pluggy_accounts"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "pluggy_transactions" ADD CONSTRAINT "pluggy_transactions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "pluggy_transactions_tx_idx" ON "pluggy_transactions" USING btree ("transaction_id");

ALTER TABLE "transactions" ADD COLUMN "source" "transaction_source" DEFAULT 'manual' NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "external_id" varchar(255);
ALTER TABLE "transactions" ADD COLUMN "status" "transaction_status" DEFAULT 'posted' NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "kind" "transaction_kind" DEFAULT 'regular' NOT NULL;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_external_id_unique" UNIQUE("external_id");

-- Backfill: o que veio de extrato carrega a marca do ImportModal/import:csv
UPDATE "transactions" SET "source" = 'csv' WHERE "notes" LIKE 'Importado via CSV — ID %';

commit;
