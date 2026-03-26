-- DB-level constraints for security-critical and state-machine columns
-- Previously enforced only at the ORM layer (Drizzle text enum)

-- 1. users.role: security-critical — controls admin access
ALTER TABLE users ADD CONSTRAINT chk_users_role
  CHECK (role IN ('admin', 'member'));

-- 2. battles.status: state machine — invalid states break battle execution
ALTER TABLE battles ADD CONSTRAINT chk_battles_status
  CHECK (status IN ('pending', 'running', 'judging', 'complete', 'failed', 'cancelled'));

-- 3. intake_candidates.status: state machine — invalid states break arena pipeline
ALTER TABLE intake_candidates ADD CONSTRAINT chk_intake_candidates_status
  CHECK (status IN ('new', 'categorized', 'scored', 'queued', 'battling', 'promoted', 'rejected', 'dismissed'));

-- 4. skill_feedback.rating: range constraint (1-5 stars)
ALTER TABLE skill_feedback ADD CONSTRAINT chk_skill_feedback_rating
  CHECK (rating >= 1 AND rating <= 5);

-- 5. intake_candidates.source_url: unique index to prevent TOCTOU race on duplicate check
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_candidates_source_url_unique
  ON intake_candidates (source_url) WHERE source_url IS NOT NULL;
