-- Skill Categories: two-level taxonomy (domain + function)
-- Replaces the broad 8-category text enum with a structured table

-- 1. Create skill_categories table
CREATE TABLE skill_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  function text NOT NULL,
  description text,
  slug text NOT NULL UNIQUE,
  skill_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX skill_categories_domain_function_idx ON skill_categories (domain, function);
--> statement-breakpoint

-- 2. Add category_id FK to skills
ALTER TABLE skills ADD COLUMN category_id uuid REFERENCES skill_categories(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX idx_skills_category_id ON skills (category_id);
--> statement-breakpoint

-- 3. Add category_id FK to intake_candidates
ALTER TABLE intake_candidates ADD COLUMN category_id uuid REFERENCES skill_categories(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX idx_intake_category_id ON intake_candidates (category_id);
--> statement-breakpoint

-- 4. Add category_id FK to arena_rankings
ALTER TABLE arena_rankings ADD COLUMN category_id uuid REFERENCES skill_categories(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX idx_rankings_category_id ON arena_rankings (category_id);
--> statement-breakpoint

-- 5. Update arena_llm_calls callType to include category_council
ALTER TABLE arena_llm_calls DROP CONSTRAINT IF EXISTS chk_arena_llm_calls_call_type;
--> statement-breakpoint
ALTER TABLE arena_llm_calls ADD CONSTRAINT chk_arena_llm_calls_call_type
  CHECK (call_type IN ('categorize', 'fight_score', 'scenario_gen', 'skill_exec_champion', 'skill_exec_challenger', 'judge', 'evolve', 'category_council'));
--> statement-breakpoint

-- 6. Update source_configs sourceType to include github_skill_repo
ALTER TABLE source_configs DROP CONSTRAINT IF EXISTS chk_source_configs_source_type;
--> statement-breakpoint
ALTER TABLE source_configs ADD CONSTRAINT chk_source_configs_source_type
  CHECK (source_type IN ('anthropic_docs', 'anthropic_blog', 'changelog', 'github_repo', 'mcp_registry', 'github_skill_repo'));
