-- Arena Observability: new tables + column additions
-- Part of the arena observability plan to track all LLM calls, ELO history, and pipeline events

-- ─── Column additions to existing tables ─────────────────────────────────────

-- battle_rounds: track per-skill execution metrics
ALTER TABLE "battle_rounds" ADD COLUMN "champion_input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "battle_rounds" ADD COLUMN "challenger_input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "battle_rounds" ADD COLUMN "champion_model" text;
--> statement-breakpoint
ALTER TABLE "battle_rounds" ADD COLUMN "challenger_model" text;
--> statement-breakpoint
ALTER TABLE "battle_rounds" ADD COLUMN "champion_latency_ms" integer;
--> statement-breakpoint
ALTER TABLE "battle_rounds" ADD COLUMN "challenger_latency_ms" integer;
--> statement-breakpoint

-- battle_judgments: track judge model and performance
ALTER TABLE "battle_judgments" ADD COLUMN "model" text;
--> statement-breakpoint
ALTER TABLE "battle_judgments" ADD COLUMN "latency_ms" integer;
--> statement-breakpoint
ALTER TABLE "battle_judgments" ADD COLUMN "input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "battle_judgments" ADD COLUMN "output_tokens" integer;
--> statement-breakpoint

-- battles: aggregate LLM usage stats
ALTER TABLE "battles" ADD COLUMN "total_llm_calls" integer;
--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "total_input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "total_output_tokens" integer;
--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "total_cost_cents" real;
--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "total_latency_ms" integer;
--> statement-breakpoint

-- ─── New table: arena_llm_calls ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "arena_llm_calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "battle_id" uuid REFERENCES "battles"("id") ON DELETE CASCADE,
  "candidate_id" uuid REFERENCES "intake_candidates"("id") ON DELETE CASCADE,
  "call_type" text NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer,
  "output_tokens" integer,
  "total_tokens" integer,
  "latency_ms" integer,
  "cost_cents" real,
  "status" text NOT NULL,
  "error_message" text,
  "raw_response" text,
  "parent_entity_id" uuid,
  "parent_entity_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_llm_calls_battle" ON "arena_llm_calls" ("battle_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_llm_calls_candidate" ON "arena_llm_calls" ("candidate_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_llm_calls_call_type" ON "arena_llm_calls" ("call_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_llm_calls_created_at" ON "arena_llm_calls" ("created_at");
--> statement-breakpoint

-- ─── New table: arena_elo_history ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "arena_elo_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "skill_id" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "battle_id" uuid NOT NULL REFERENCES "battles"("id") ON DELETE CASCADE,
  "elo_before" real NOT NULL,
  "elo_after" real NOT NULL,
  "elo_change" real NOT NULL,
  "opponent_elo" real NOT NULL,
  "outcome" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_elo_history_skill" ON "arena_elo_history" ("skill_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_elo_history_battle" ON "arena_elo_history" ("battle_id");
--> statement-breakpoint

-- ─── New table: arena_pipeline_events ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "arena_pipeline_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "phase" text NOT NULL,
  "previous_phase" text,
  "duration_ms" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_pipeline_events_entity" ON "arena_pipeline_events" ("entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pipeline_events_phase" ON "arena_pipeline_events" ("phase");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pipeline_events_created_at" ON "arena_pipeline_events" ("created_at");
