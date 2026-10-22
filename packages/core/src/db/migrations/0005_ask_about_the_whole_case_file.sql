CREATE TYPE "public"."question_scope" AS ENUM('whole-file', 'peca');--> statement-breakpoint
CREATE TYPE "public"."quick_action" AS ENUM('timeline', 'people', 'amounts');--> statement-breakpoint
ALTER TABLE "question" DROP CONSTRAINT "question_peca_id_peca_id_fk";
--> statement-breakpoint
ALTER TABLE "question" ALTER COLUMN "scope" SET DATA TYPE "public"."question_scope" USING "scope"::"public"."question_scope";--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "quick_action" "quick_action";--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_peca_id_peca_id_fk" FOREIGN KEY ("peca_id") REFERENCES "public"."peca"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_scope_peca_check" CHECK (("question"."scope" = 'peca') = ("question"."peca_id" IS NOT NULL));