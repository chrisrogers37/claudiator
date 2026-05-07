CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"skill_id" uuid,
	"skill_slug" text,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_activity_events_event_type" CHECK ("activity_events"."event_type" IN ('sync', 'rollback', 'pin', 'unpin', 'feedback', 'token_generate', 'token_rotate', 'publish', 'version_nudge', 'feedback_status_change'))
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"name" text NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"total_calls" integer DEFAULT 0 NOT NULL,
	"successful_calls" integer DEFAULT 0 NOT NULL,
	"failed_calls" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_elo_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"battle_id" uuid NOT NULL,
	"elo_before" real NOT NULL,
	"elo_after" real NOT NULL,
	"elo_change" real NOT NULL,
	"opponent_elo" real NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_arena_elo_history_outcome" CHECK ("arena_elo_history"."outcome" IN ('win', 'loss', 'draw'))
);
--> statement-breakpoint
CREATE TABLE "arena_llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"battle_id" uuid,
	"candidate_id" uuid,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_arena_llm_calls_call_type" CHECK ("arena_llm_calls"."call_type" IN ('categorize', 'fight_score', 'scenario_gen', 'skill_exec_champion', 'skill_exec_challenger', 'judge', 'evolve', 'category_council', 'verdict_synthesis')),
	CONSTRAINT "chk_arena_llm_calls_status" CHECK ("arena_llm_calls"."status" IN ('success', 'error', 'parse_failure', 'rate_limited')),
	CONSTRAINT "chk_arena_llm_calls_parent_entity_type" CHECK ("arena_llm_calls"."parent_entity_type" IN ('battle_round', 'battle_scenario', 'battle_judgment', 'intake_candidate'))
);
--> statement-breakpoint
CREATE TABLE "arena_pipeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"previous_phase" text,
	"duration_ms" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_arena_pipeline_events_entity_type" CHECK ("arena_pipeline_events"."entity_type" IN ('candidate', 'battle'))
);
--> statement-breakpoint
CREATE TABLE "arena_rankings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"category_id" uuid,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"win_rate" real DEFAULT 0 NOT NULL,
	"elo_rating" real DEFAULT 1200 NOT NULL,
	"title" text,
	"last_battle_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arena_rankings_skill_id_unique" UNIQUE("skill_id")
);
--> statement-breakpoint
CREATE TABLE "battle_judgments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"judge_index" integer NOT NULL,
	"winner_id" text NOT NULL,
	"scores" jsonb NOT NULL,
	"reasoning" text NOT NULL,
	"confidence" integer NOT NULL,
	"model" text,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_battle_judgments_winner_id" CHECK ("battle_judgments"."winner_id" IN ('champion', 'challenger', 'draw'))
);
--> statement-breakpoint
CREATE TABLE "battle_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"battle_id" uuid NOT NULL,
	"scenario_id" uuid NOT NULL,
	"round_index" integer NOT NULL,
	"champion_output" text NOT NULL,
	"challenger_output" text NOT NULL,
	"champion_tokens" integer,
	"challenger_tokens" integer,
	"champion_input_tokens" integer,
	"challenger_input_tokens" integer,
	"champion_model" text,
	"challenger_model" text,
	"champion_latency_ms" integer,
	"challenger_latency_ms" integer,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"battle_id" uuid NOT NULL,
	"scenario_index" integer NOT NULL,
	"description" text NOT NULL,
	"project_context" text NOT NULL,
	"user_prompt" text NOT NULL,
	"difficulty" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_battle_scenarios_difficulty" CHECK ("battle_scenarios"."difficulty" IN ('easy', 'medium', 'hard'))
);
--> statement-breakpoint
CREATE TABLE "battles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenger_id" uuid NOT NULL,
	"champion_skill_id" uuid NOT NULL,
	"champion_version_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verdict" text,
	"verdict_summary" text,
	"champion_score" real,
	"challenger_score" real,
	"config" jsonb NOT NULL,
	"evolution_battle_id" uuid,
	"total_llm_calls" integer,
	"total_input_tokens" integer,
	"total_output_tokens" integer,
	"total_cost_cents" real,
	"total_latency_ms" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_battles_status" CHECK ("battles"."status" IN ('pending', 'running', 'judging', 'complete', 'failed', 'cancelled')),
	CONSTRAINT "chk_battles_verdict" CHECK ("battles"."verdict" IN ('champion_wins', 'challenger_wins', 'draw'))
);
--> statement-breakpoint
CREATE TABLE "intake_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"raw_content" text NOT NULL,
	"extracted_purpose" text,
	"category_id" uuid,
	"matched_champion_skill_id" uuid,
	"fight_score" integer,
	"status" text DEFAULT 'new' NOT NULL,
	"submitted_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_intake_candidates_source_type" CHECK ("intake_candidates"."source_type" IN ('github_skill', 'web_article', 'community_submission', 'provider_skills')),
	CONSTRAINT "chk_intake_candidates_status" CHECK ("intake_candidates"."status" IN ('new', 'categorized', 'scored', 'queued', 'battling', 'promoted', 'rejected', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "learning_skill_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"skill_slug" text NOT NULL,
	"proposed_change" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_learning_skill_links_status" CHECK ("learning_skill_links"."status" IN ('pending', 'applied', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"full_content" text,
	"source_url" text,
	"source_type" text NOT NULL,
	"relevance_tags" text[] DEFAULT '{}',
	"distilled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_learnings_source_type" CHECK ("learnings"."source_type" IN ('blog', 'docs', 'changelog', 'community', 'anthropic_docs', 'anthropic_blog', 'github_repo', 'mcp_registry')),
	CONSTRAINT "chk_learnings_status" CHECK ("learnings"."status" IN ('new', 'reviewed', 'applied', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "skill_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"function" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"skill_count" integer DEFAULT 0 NOT NULL,
	"scoring_rubric" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "skill_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"skill_slug" text NOT NULL,
	"skill_version" text,
	"rating" smallint NOT NULL,
	"comment" text,
	"session_id" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"resolved_by_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_skill_feedback_rating" CHECK ("skill_feedback"."rating" >= 1 AND "skill_feedback"."rating" <= 5),
	CONSTRAINT "chk_skill_feedback_status" CHECK ("skill_feedback"."status" IN ('new', 'acknowledged', 'in_progress', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "skill_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"skill_slug" text NOT NULL,
	"skill_version" text,
	"invoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" text NOT NULL,
	"success" boolean,
	"duration_ms" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "skill_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"version" text NOT NULL,
	"content" text NOT NULL,
	"references" jsonb,
	"changelog" text,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_latest" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category_id" uuid,
	"is_user_invocable" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "source_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"source_type" text NOT NULL,
	"check_frequency" text DEFAULT 'daily' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"fetch_config" jsonb DEFAULT '{}'::jsonb,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_configs_url_unique" UNIQUE("url"),
	CONSTRAINT "chk_source_configs_source_type" CHECK ("source_configs"."source_type" IN ('anthropic_docs', 'anthropic_blog', 'changelog', 'github_repo', 'mcp_registry', 'github_skill_repo')),
	CONSTRAINT "chk_source_configs_check_frequency" CHECK ("source_configs"."check_frequency" IN ('daily', 'weekly'))
);
--> statement-breakpoint
CREATE TABLE "source_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_config_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"raw_content" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_installed_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_slug" text NOT NULL,
	"installed_version" text NOT NULL,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_skill_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"pinned_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" integer NOT NULL,
	"github_username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"email" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "chk_users_role" CHECK ("users"."role" IN ('admin', 'member'))
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_elo_history" ADD CONSTRAINT "arena_elo_history_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_elo_history" ADD CONSTRAINT "arena_elo_history_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_llm_calls" ADD CONSTRAINT "arena_llm_calls_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_llm_calls" ADD CONSTRAINT "arena_llm_calls_candidate_id_intake_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."intake_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_rankings" ADD CONSTRAINT "arena_rankings_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_rankings" ADD CONSTRAINT "arena_rankings_category_id_skill_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_judgments" ADD CONSTRAINT "battle_judgments_round_id_battle_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."battle_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_rounds" ADD CONSTRAINT "battle_rounds_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_rounds" ADD CONSTRAINT "battle_rounds_scenario_id_battle_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."battle_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_scenarios" ADD CONSTRAINT "battle_scenarios_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_challenger_id_intake_candidates_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."intake_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_champion_skill_id_skills_id_fk" FOREIGN KEY ("champion_skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_champion_version_id_skill_versions_id_fk" FOREIGN KEY ("champion_version_id") REFERENCES "public"."skill_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_candidates" ADD CONSTRAINT "intake_candidates_category_id_skill_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_candidates" ADD CONSTRAINT "intake_candidates_matched_champion_skill_id_skills_id_fk" FOREIGN KEY ("matched_champion_skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_candidates" ADD CONSTRAINT "intake_candidates_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_skill_links" ADD CONSTRAINT "learning_skill_links_learning_id_learnings_id_fk" FOREIGN KEY ("learning_id") REFERENCES "public"."learnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_skill_links" ADD CONSTRAINT "learning_skill_links_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_feedback" ADD CONSTRAINT "skill_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_feedback" ADD CONSTRAINT "skill_feedback_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_feedback" ADD CONSTRAINT "skill_feedback_resolved_by_version_id_skill_versions_id_fk" FOREIGN KEY ("resolved_by_version_id") REFERENCES "public"."skill_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_invocations" ADD CONSTRAINT "skill_invocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_invocations" ADD CONSTRAINT "skill_invocations_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_category_id_skill_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_source_config_id_source_configs_id_fk" FOREIGN KEY ("source_config_id") REFERENCES "public"."source_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_installed_versions" ADD CONSTRAINT "user_installed_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skill_pins" ADD CONSTRAINT "user_skill_pins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skill_pins" ADD CONSTRAINT "user_skill_pins_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_events_user_created" ON "activity_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_activity_events_event_type" ON "activity_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_activity_events_skill_id" ON "activity_events" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_tokens_token_prefix_idx" ON "api_tokens" USING btree ("token_prefix");--> statement-breakpoint
CREATE INDEX "idx_elo_history_skill" ON "arena_elo_history" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "idx_elo_history_battle" ON "arena_elo_history" USING btree ("battle_id");--> statement-breakpoint
CREATE INDEX "idx_llm_calls_battle" ON "arena_llm_calls" USING btree ("battle_id");--> statement-breakpoint
CREATE INDEX "idx_llm_calls_candidate" ON "arena_llm_calls" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_llm_calls_call_type" ON "arena_llm_calls" USING btree ("call_type");--> statement-breakpoint
CREATE INDEX "idx_llm_calls_created_at" ON "arena_llm_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_pipeline_events_entity" ON "arena_pipeline_events" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_pipeline_events_phase" ON "arena_pipeline_events" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "idx_pipeline_events_created_at" ON "arena_pipeline_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_rankings_elo" ON "arena_rankings" USING btree ("elo_rating");--> statement-breakpoint
CREATE INDEX "idx_judgments_round" ON "battle_judgments" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "idx_rounds_battle" ON "battle_rounds" USING btree ("battle_id");--> statement-breakpoint
CREATE INDEX "idx_rounds_scenario" ON "battle_rounds" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "idx_scenarios_battle" ON "battle_scenarios" USING btree ("battle_id");--> statement-breakpoint
CREATE INDEX "idx_battles_status" ON "battles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_battles_champion_skill" ON "battles" USING btree ("champion_skill_id");--> statement-breakpoint
CREATE INDEX "idx_battles_challenger" ON "battles" USING btree ("challenger_id");--> statement-breakpoint
CREATE INDEX "idx_intake_status" ON "intake_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_intake_fight_score" ON "intake_candidates" USING btree ("fight_score");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_skill_links_unique_v2" ON "learning_skill_links" USING btree ("learning_id","skill_id");--> statement-breakpoint
CREATE INDEX "idx_learning_skill_links_learning" ON "learning_skill_links" USING btree ("learning_id");--> statement-breakpoint
CREATE INDEX "idx_learning_skill_links_skill_id" ON "learning_skill_links" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "idx_learning_skill_links_skill" ON "learning_skill_links" USING btree ("skill_slug");--> statement-breakpoint
CREATE INDEX "idx_learning_skill_links_status" ON "learning_skill_links" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_learnings_status" ON "learnings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_learnings_distilled_at" ON "learnings" USING btree ("distilled_at");--> statement-breakpoint
CREATE INDEX "idx_learnings_source_type" ON "learnings" USING btree ("source_type");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_categories_domain_function_idx" ON "skill_categories" USING btree ("domain","function");--> statement-breakpoint
CREATE INDEX "idx_feedback_skill_id" ON "skill_feedback" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "idx_feedback_skill_slug" ON "skill_feedback" USING btree ("skill_slug");--> statement-breakpoint
CREATE INDEX "idx_feedback_user_id" ON "skill_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_feedback_session_id" ON "skill_feedback" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_feedback_status" ON "skill_feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invocations_skill_id" ON "skill_invocations" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "idx_invocations_skill_slug" ON "skill_invocations" USING btree ("skill_slug");--> statement-breakpoint
CREATE INDEX "idx_invocations_user_id" ON "skill_invocations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_invocations_session_id" ON "skill_invocations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_invocations_invoked_at" ON "skill_invocations" USING btree ("invoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_versions_skill_version_idx" ON "skill_versions" USING btree ("skill_id","version");--> statement-breakpoint
CREATE INDEX "skill_versions_skill_id_idx" ON "skill_versions" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_versions_is_latest_idx" ON "skill_versions" USING btree ("skill_id","is_latest");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_versions_one_latest_idx" ON "skill_versions" USING btree ("skill_id") WHERE "skill_versions"."is_latest" = true;--> statement-breakpoint
CREATE INDEX "idx_source_configs_active" ON "source_configs" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_snapshots_source_fetched" ON "source_snapshots" USING btree ("source_config_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_installed_versions_user_skill_idx" ON "user_installed_versions" USING btree ("user_id","skill_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "user_skill_pins_user_skill_idx" ON "user_skill_pins" USING btree ("user_id","skill_id");