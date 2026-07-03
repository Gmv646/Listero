ALTER TABLE "bank_accounts" ADD COLUMN "business_treatment" text DEFAULT 'mixed';--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "connection_type" text DEFAULT 'live';--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "archived" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "history_mode" text;