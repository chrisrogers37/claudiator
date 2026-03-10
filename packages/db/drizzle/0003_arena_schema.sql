-- Arena Schema (Phase A)
-- Adds intake candidates, battles, scenarios, rounds, judgments, and rankings tables

CREATE TABLE "intake_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_type" text NOT NULL,
  "source_url" text,
  "raw_content" text NOT NULL,
  "extracted_purpose" text,
  "category" text,
  "matched_champion_skill_id" uuid REFERENCES "skills"("id") ON DELETE SET NULL,
  "fight_score" integer,
  "status" text NOT NULL DEFAULT 'new',
  "submitted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_intake_status" ON "intake_candidates" ("status");
CREATE INDEX "idx_intake_category" ON "intake_candidates" ("category");
CREATE INDEX "idx_intake_fight_score" ON "intake_candidates" ("fight_score");

CREATE TABLE "battles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "challenger_id" uuid NOT NULL REFERENCES "intake_candidates"("id") ON DELETE CASCADE,
  "champion_skill_id" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "champion_version_id" uuid NOT NULL REFERENCES "skill_versions"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "verdict" text,
  "champion_score" real,
  "challenger_score" real,
  "config" jsonb NOT NULL,
  "evolution_battle_id" uuid,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_battles_status" ON "battles" ("status");
CREATE INDEX "idx_battles_champion_skill" ON "battles" ("champion_skill_id");
CREATE INDEX "idx_battles_challenger" ON "battles" ("challenger_id");

CREATE TABLE "battle_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "battle_id" uuid NOT NULL REFERENCES "battles"("id") ON DELETE CASCADE,
  "scenario_index" integer NOT NULL,
  "description" text NOT NULL,
  "project_context" text NOT NULL,
  "user_prompt" text NOT NULL,
  "difficulty" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_scenarios_battle" ON "battle_scenarios" ("battle_id");

CREATE TABLE "battle_rounds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "battle_id" uuid NOT NULL REFERENCES "battles"("id") ON DELETE CASCADE,
  "scenario_id" uuid NOT NULL REFERENCES "battle_scenarios"("id") ON DELETE CASCADE,
  "round_index" integer NOT NULL,
  "champion_output" text NOT NULL,
  "challenger_output" text NOT NULL,
  "champion_tokens" integer,
  "challenger_tokens" integer,
  "executed_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_rounds_battle" ON "battle_rounds" ("battle_id");
CREATE INDEX "idx_rounds_scenario" ON "battle_rounds" ("scenario_id");

CREATE TABLE "battle_judgments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "round_id" uuid NOT NULL REFERENCES "battle_rounds"("id") ON DELETE CASCADE,
  "judge_index" integer NOT NULL,
  "winner_id" text NOT NULL,
  "scores" jsonb NOT NULL,
  "reasoning" text NOT NULL,
  "confidence" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_judgments_round" ON "battle_judgments" ("round_id");

CREATE TABLE "arena_rankings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "skill_id" uuid NOT NULL UNIQUE REFERENCES "skills"("id") ON DELETE CASCADE,
  "category" text,
  "wins" integer NOT NULL DEFAULT 0,
  "losses" integer NOT NULL DEFAULT 0,
  "draws" integer NOT NULL DEFAULT 0,
  "win_rate" real NOT NULL DEFAULT 0,
  "elo_rating" real NOT NULL DEFAULT 1200,
  "title" text,
  "last_battle_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_rankings_category" ON "arena_rankings" ("category");
CREATE INDEX "idx_rankings_elo" ON "arena_rankings" ("elo_rating");
