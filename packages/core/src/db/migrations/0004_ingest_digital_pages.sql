DROP INDEX "page_case_file_number_idx";--> statement-breakpoint
ALTER TABLE "page" ADD CONSTRAINT "page_case_file_id_number_pk" PRIMARY KEY("case_file_id","number");--> statement-breakpoint
ALTER TABLE "case_file" ADD COLUMN "unread_pages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "passage" ADD CONSTRAINT "passage_case_file_id_page_page_case_file_id_number_fk" FOREIGN KEY ("case_file_id","page") REFERENCES "public"."page"("case_file_id","number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_range" ADD CONSTRAINT "ingestion_range_pages_check" CHECK ("ingestion_range"."first_page" <= "ingestion_range"."last_page");