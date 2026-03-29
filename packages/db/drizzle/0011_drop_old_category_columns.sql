-- Drop old category text columns and their indexes from all three tables.
-- The two-level taxonomy (skill_categories via categoryId FK) is now the sole system.

-- skills: drop CHECK constraint, index, and column
ALTER TABLE skills DROP CONSTRAINT IF EXISTS chk_skills_category;
--> statement-breakpoint
DROP INDEX IF EXISTS skills_category_idx;
--> statement-breakpoint
ALTER TABLE skills DROP COLUMN IF EXISTS category;
--> statement-breakpoint
-- intake_candidates: drop index and column
DROP INDEX IF EXISTS idx_intake_category;
--> statement-breakpoint
ALTER TABLE intake_candidates DROP COLUMN IF EXISTS category;
--> statement-breakpoint
-- arena_rankings: drop index and column
DROP INDEX IF EXISTS idx_rankings_category;
--> statement-breakpoint
ALTER TABLE arena_rankings DROP COLUMN IF EXISTS category;
