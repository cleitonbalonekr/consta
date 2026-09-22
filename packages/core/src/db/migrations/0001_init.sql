CREATE TYPE "public"."case_file_status" AS ENUM('uploading', 'queued', 'processing', 'mapping', 'ready', 'failed', 'deleting');--> statement-breakpoint
CREATE TYPE "public"."fact_kind" AS ENUM('person', 'role', 'date', 'amount', 'event');--> statement-breakpoint
CREATE TYPE "public"."page_source" AS ENUM('digital', 'scanned');--> statement-breakpoint
CREATE TYPE "public"."peca_type" AS ENUM('peticao-inicial', 'contestacao', 'replica', 'despacho', 'decisao', 'sentenca', 'acordao', 'recurso', 'laudo', 'ata-de-audiencia', 'procuracao', 'documento', 'outro');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('trial', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."usage_kind" AS ENUM('ocr', 'embed', 'rerank', 'extract', 'answer');--> statement-breakpoint
CREATE TABLE "case_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lawyer_id" text NOT NULL,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"upload_id" text,
	"size_bytes" integer NOT NULL,
	"page_count" integer NOT NULL,
	"status" "case_file_status" DEFAULT 'uploading' NOT NULL,
	"pages_done" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	CONSTRAINT "case_file_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "fact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_file_id" uuid NOT NULL,
	"kind" "fact_kind" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text,
	"context" text NOT NULL,
	"page" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_range" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_file_id" uuid NOT NULL,
	"first_page" integer NOT NULL,
	"last_page" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lawyer_plan" (
	"lawyer_id" text PRIMARY KEY NOT NULL,
	"plan" "plan" DEFAULT 'trial' NOT NULL,
	"page_quota" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page" (
	"case_file_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"folha" text,
	"source" "page_source" NOT NULL,
	"text" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"ocr_confidence" real
);
--> statement-breakpoint
CREATE TABLE "passage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_file_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"text" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('portuguese', "text")) STORED NOT NULL,
	"embedding" halfvec(1024) NOT NULL,
	"embedding_model" text NOT NULL,
	"block_indexes" integer[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "peca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_file_id" uuid NOT NULL,
	"type" "peca_type" NOT NULL,
	"title" text NOT NULL,
	"date" date,
	"first_page" integer NOT NULL,
	"last_page" integer NOT NULL,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_file_id" uuid NOT NULL,
	"lawyer_id" text NOT NULL,
	"scope" text NOT NULL,
	"peca_id" uuid,
	"text" text NOT NULL,
	"answer" jsonb NOT NULL,
	"dropped_statements" integer DEFAULT 0 NOT NULL,
	"feedback" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_charge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lawyer_id" text NOT NULL,
	"case_file_id" uuid,
	"pages" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lawyer_id" text NOT NULL,
	"case_file_id" uuid,
	"kind" "usage_kind" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"units" integer NOT NULL,
	"unit" text NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fact" ADD CONSTRAINT "fact_case_file_id_case_file_id_fk" FOREIGN KEY ("case_file_id") REFERENCES "public"."case_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_range" ADD CONSTRAINT "ingestion_range_case_file_id_case_file_id_fk" FOREIGN KEY ("case_file_id") REFERENCES "public"."case_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page" ADD CONSTRAINT "page_case_file_id_case_file_id_fk" FOREIGN KEY ("case_file_id") REFERENCES "public"."case_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage" ADD CONSTRAINT "passage_case_file_id_case_file_id_fk" FOREIGN KEY ("case_file_id") REFERENCES "public"."case_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peca" ADD CONSTRAINT "peca_case_file_id_case_file_id_fk" FOREIGN KEY ("case_file_id") REFERENCES "public"."case_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_case_file_id_case_file_id_fk" FOREIGN KEY ("case_file_id") REFERENCES "public"."case_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_peca_id_peca_id_fk" FOREIGN KEY ("peca_id") REFERENCES "public"."peca"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_case_file_id_case_file_id_fk" FOREIGN KEY ("case_file_id") REFERENCES "public"."case_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_file_lawyer_idx" ON "case_file" USING btree ("lawyer_id","created_at");--> statement-breakpoint
CREATE INDEX "fact_case_file_kind_idx" ON "fact" USING btree ("case_file_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_range_case_file_first_page_idx" ON "ingestion_range" USING btree ("case_file_id","first_page");--> statement-breakpoint
CREATE UNIQUE INDEX "page_case_file_number_idx" ON "page" USING btree ("case_file_id","number");--> statement-breakpoint
CREATE INDEX "passage_case_file_page_idx" ON "passage" USING btree ("case_file_id","page");--> statement-breakpoint
CREATE INDEX "passage_tsv_idx" ON "passage" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "passage_embedding_idx" ON "passage" USING hnsw ("embedding" halfvec_cosine_ops);--> statement-breakpoint
CREATE INDEX "peca_case_file_first_page_idx" ON "peca" USING btree ("case_file_id","first_page");--> statement-breakpoint
CREATE INDEX "question_case_file_idx" ON "question" USING btree ("case_file_id","created_at");--> statement-breakpoint
CREATE INDEX "quota_charge_lawyer_created_idx" ON "quota_charge" USING btree ("lawyer_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_event_lawyer_created_idx" ON "usage_event" USING btree ("lawyer_id","created_at");