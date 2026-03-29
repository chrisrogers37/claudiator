-- CHECK constraints for all remaining text enum columns
-- Complements 0006 which covered users.role, battles.status, intake_candidates.status, skill_feedback.rating

-- skills.category
ALTER TABLE skills ADD CONSTRAINT chk_skills_category
  CHECK (category IN ('deployment', 'database', 'code-review', 'planning', 'design', 'workflow', 'utilities', 'configuration'));
--> statement-breakpoint

-- activity_events.event_type
ALTER TABLE activity_events ADD CONSTRAINT chk_activity_events_event_type
  CHECK (event_type IN ('sync', 'rollback', 'pin', 'unpin', 'feedback', 'token_generate', 'token_rotate', 'publish', 'version_nudge', 'feedback_status_change'));
--> statement-breakpoint

-- skill_feedback.status
ALTER TABLE skill_feedback ADD CONSTRAINT chk_skill_feedback_status
  CHECK (status IN ('new', 'acknowledged', 'in_progress', 'resolved'));
--> statement-breakpoint

-- source_configs.source_type
ALTER TABLE source_configs ADD CONSTRAINT chk_source_configs_source_type
  CHECK (source_type IN ('anthropic_docs', 'anthropic_blog', 'changelog', 'github_repo', 'mcp_registry'));
--> statement-breakpoint

-- source_configs.check_frequency
ALTER TABLE source_configs ADD CONSTRAINT chk_source_configs_check_frequency
  CHECK (check_frequency IN ('daily', 'weekly'));
--> statement-breakpoint

-- learnings.source_type
ALTER TABLE learnings ADD CONSTRAINT chk_learnings_source_type
  CHECK (source_type IN ('blog', 'docs', 'changelog', 'community', 'anthropic_docs', 'anthropic_blog', 'github_repo', 'mcp_registry'));
--> statement-breakpoint

-- learnings.status
ALTER TABLE learnings ADD CONSTRAINT chk_learnings_status
  CHECK (status IN ('new', 'reviewed', 'applied', 'dismissed'));
--> statement-breakpoint

-- learning_skill_links.status
ALTER TABLE learning_skill_links ADD CONSTRAINT chk_learning_skill_links_status
  CHECK (status IN ('pending', 'applied', 'rejected'));
--> statement-breakpoint

-- intake_candidates.source_type
ALTER TABLE intake_candidates ADD CONSTRAINT chk_intake_candidates_source_type
  CHECK (source_type IN ('github_skill', 'web_article', 'community_submission', 'provider_skills'));
--> statement-breakpoint

-- battle_scenarios.difficulty
ALTER TABLE battle_scenarios ADD CONSTRAINT chk_battle_scenarios_difficulty
  CHECK (difficulty IN ('easy', 'medium', 'hard'));
--> statement-breakpoint

-- battles.verdict
ALTER TABLE battles ADD CONSTRAINT chk_battles_verdict
  CHECK (verdict IN ('champion_wins', 'challenger_wins', 'draw'));
--> statement-breakpoint

-- battle_judgments.winner_id
ALTER TABLE battle_judgments ADD CONSTRAINT chk_battle_judgments_winner_id
  CHECK (winner_id IN ('champion', 'challenger', 'draw'));
--> statement-breakpoint

-- arena_llm_calls.call_type
ALTER TABLE arena_llm_calls ADD CONSTRAINT chk_arena_llm_calls_call_type
  CHECK (call_type IN ('categorize', 'fight_score', 'scenario_gen', 'skill_exec_champion', 'skill_exec_challenger', 'judge', 'evolve'));
--> statement-breakpoint

-- arena_llm_calls.status
ALTER TABLE arena_llm_calls ADD CONSTRAINT chk_arena_llm_calls_status
  CHECK (status IN ('success', 'error', 'parse_failure', 'rate_limited'));
--> statement-breakpoint

-- arena_llm_calls.parent_entity_type
ALTER TABLE arena_llm_calls ADD CONSTRAINT chk_arena_llm_calls_parent_entity_type
  CHECK (parent_entity_type IN ('battle_round', 'battle_scenario', 'battle_judgment', 'intake_candidate'));
--> statement-breakpoint

-- arena_elo_history.outcome
ALTER TABLE arena_elo_history ADD CONSTRAINT chk_arena_elo_history_outcome
  CHECK (outcome IN ('win', 'loss', 'draw'));
--> statement-breakpoint

-- arena_pipeline_events.entity_type
ALTER TABLE arena_pipeline_events ADD CONSTRAINT chk_arena_pipeline_events_entity_type
  CHECK (entity_type IN ('candidate', 'battle'));
