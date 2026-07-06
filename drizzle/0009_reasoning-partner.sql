ALTER TABLE "transactions" ADD COLUMN "deductible_pct" numeric;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "cpa_narrative" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "position_confidence" numeric;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "cpa_review_reason" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "receipt_meta" jsonb;