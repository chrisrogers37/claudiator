-- Phase 05: Team Dashboard schema changes
-- 1. Rename sync_events → activity_events + extend
ALTER TABLE sync_events RENAME TO activity_events;
--> statement-breakpoint

ALTER TABLE activity_events ADD COLUMN skill_slug text;
--> statement-breakpoint

-- Drop old index and create new ones
DROP INDEX IF EXISTS idx_sync_events_user_created;
--> statement-breakpoint
CREATE INDEX idx_activity_events_user_created ON activity_events (user_id, created_at);
--> statement-breakpoint
CREATE INDEX idx_activity_events_event_type ON activity_events (event_type);
--> statement-breakpoint

-- 2. Add status columns to skill_feedback
ALTER TABLE skill_feedback ADD COLUMN status text NOT NULL DEFAULT 'new';
--> statement-breakpoint
ALTER TABLE skill_feedback ADD COLUMN resolved_by_version_id uuid REFERENCES skill_versions(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX idx_feedback_status ON skill_feedback (status);
--> statement-breakpoint

-- 3. Create user_installed_versions table
CREATE TABLE user_installed_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_slug text NOT NULL,
  installed_version text NOT NULL,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_installed_versions_user_skill_idx UNIQUE (user_id, skill_slug)
);
