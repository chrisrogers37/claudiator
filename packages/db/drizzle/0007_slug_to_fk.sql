-- Migrate slug-based text references to proper FK relationships
-- Adds skill_id FK column to 4 tables, backfills from skills.slug, then adds NOT NULL

-- 1. skill_invocations: add skill_id FK
ALTER TABLE skill_invocations ADD COLUMN skill_id uuid REFERENCES skills(id) ON DELETE CASCADE;
--> statement-breakpoint
UPDATE skill_invocations SET skill_id = s.id FROM skills s WHERE skill_invocations.skill_slug = s.slug;
--> statement-breakpoint
ALTER TABLE skill_invocations ALTER COLUMN skill_id SET NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_invocations_skill_id ON skill_invocations (skill_id);
--> statement-breakpoint

-- 2. skill_feedback: add skill_id FK
ALTER TABLE skill_feedback ADD COLUMN skill_id uuid REFERENCES skills(id) ON DELETE CASCADE;
--> statement-breakpoint
UPDATE skill_feedback SET skill_id = s.id FROM skills s WHERE skill_feedback.skill_slug = s.slug;
--> statement-breakpoint
ALTER TABLE skill_feedback ALTER COLUMN skill_id SET NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_feedback_skill_id ON skill_feedback (skill_id);
--> statement-breakpoint

-- 3. learning_skill_links: add skill_id FK
ALTER TABLE learning_skill_links ADD COLUMN skill_id uuid REFERENCES skills(id) ON DELETE CASCADE;
--> statement-breakpoint
UPDATE learning_skill_links SET skill_id = s.id FROM skills s WHERE learning_skill_links.skill_slug = s.slug;
--> statement-breakpoint
ALTER TABLE learning_skill_links ALTER COLUMN skill_id SET NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_learning_skill_links_skill_id ON learning_skill_links (skill_id);
--> statement-breakpoint
-- Replace slug-based unique with skill_id-based unique
DROP INDEX IF EXISTS learning_skill_links_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX learning_skill_links_unique_v2 ON learning_skill_links (learning_id, skill_id);
--> statement-breakpoint

-- 4. activity_events: add skill_id FK (nullable — not all events have a skill)
ALTER TABLE activity_events ADD COLUMN skill_id uuid REFERENCES skills(id) ON DELETE SET NULL;
--> statement-breakpoint
UPDATE activity_events SET skill_id = s.id FROM skills s WHERE activity_events.skill_slug = s.slug;
--> statement-breakpoint
CREATE INDEX idx_activity_events_skill_id ON activity_events (skill_id);
--> statement-breakpoint

-- Note: skill_slug columns are kept for now (marked deprecated in schema).
-- They can be dropped in a future migration after verifying all code uses skill_id.
