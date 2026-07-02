ALTER TABLE "bank_connections" ALTER COLUMN "provider" SET DEFAULT 'plaid';--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "sync_cursor" text;