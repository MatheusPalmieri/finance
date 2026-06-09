CREATE TYPE "public"."client_phase" AS ENUM('PROSPECTING', 'NEGOTIATING', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."close_reason" AS ENUM('CLIENT', 'TRIAL', 'CUSTOM_TRIAL', 'PRICE_OBJECTION', 'NO_FIT', 'GHOST', 'UNREACHABLE');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone_area_code" varchar(2) NOT NULL,
	"phone_number" varchar(8) NOT NULL,
	"responsible_phone_area_code" varchar(2),
	"responsible_phone_number" varchar(8),
	"city" varchar(255) NOT NULL,
	"phase" "client_phase" DEFAULT 'PROSPECTING' NOT NULL,
	"close_reason" "close_reason",
	"message_sent_at" timestamp,
	"negotiating_started_at" timestamp,
	"closed_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
