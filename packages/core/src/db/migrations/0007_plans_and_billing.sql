ALTER TABLE "lawyer_plan" ADD COLUMN "billing_customer" text;--> statement-breakpoint
ALTER TABLE "lawyer_plan" ADD COLUMN "plan_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lawyer_plan" ADD CONSTRAINT "lawyer_plan_billing_customer_unique" UNIQUE("billing_customer");