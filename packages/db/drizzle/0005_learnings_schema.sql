-- Learnings tables (intelligence pipeline display layer)
-- These tables were previously created via drizzle-kit push and had no migration file.

-- 1. Learnings table
CREATE TABLE IF NOT EXISTS learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text NOT NULL,
  full_content text,
  source_url text,
  source_type text NOT NULL,
  relevance_tags text[] DEFAULT '{}',
  distilled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_learnings_status ON learnings (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_learnings_distilled_at ON learnings (distilled_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_learnings_source_type ON learnings (source_type);
--> statement-breakpoint

-- 2. Learning-skill links table
CREATE TABLE IF NOT EXISTS learning_skill_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id uuid NOT NULL REFERENCES learnings(id) ON DELETE CASCADE,
  skill_slug text NOT NULL,
  proposed_change text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learning_skill_links_unique ON learning_skill_links (learning_id, skill_slug);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_learning_skill_links_learning ON learning_skill_links (learning_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_learning_skill_links_skill ON learning_skill_links (skill_slug);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_learning_skill_links_status ON learning_skill_links (status);
