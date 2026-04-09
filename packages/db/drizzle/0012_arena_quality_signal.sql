-- Arena Quality & Signal Enhancement
-- Adds scoring rubric support for categories and verdict synthesis for battles

ALTER TABLE "skill_categories" ADD COLUMN "scoring_rubric" jsonb;
--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "verdict_summary" text;
