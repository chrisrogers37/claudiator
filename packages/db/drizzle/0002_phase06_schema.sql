-- Phase 06: Intelligence Pipeline schema changes

-- 1. Source configurations table
CREATE TABLE source_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL UNIQUE,
  source_type text NOT NULL,
  check_frequency text NOT NULL DEFAULT 'daily',
  is_active boolean NOT NULL DEFAULT true,
  fetch_config jsonb DEFAULT '{}',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX idx_source_configs_active ON source_configs (is_active);
--> statement-breakpoint

-- 2. Source snapshots table
CREATE TABLE source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_config_id uuid NOT NULL REFERENCES source_configs(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  raw_content text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX idx_snapshots_source_fetched ON source_snapshots (source_config_id, fetched_at DESC);
--> statement-breakpoint

-- 3. Seed initial source configurations
INSERT INTO source_configs (name, url, source_type, check_frequency, fetch_config) VALUES
  ('Claude Code Docs', 'https://docs.anthropic.com/en/docs/claude-code', 'anthropic_docs', 'daily', '{}'),
  ('Claude Code Changelog', 'https://docs.anthropic.com/en/docs/claude-code/changelog', 'changelog', 'daily', '{}'),
  ('Anthropic Blog', 'https://www.anthropic.com/blog', 'anthropic_blog', 'daily', '{}'),
  ('Claude Model Card', 'https://docs.anthropic.com/en/docs/about-claude/models', 'anthropic_docs', 'weekly', '{}'),
  ('MCP Specification', 'https://github.com/modelcontextprotocol/specification', 'github_repo', 'weekly', '{"watch": "releases"}'),
  ('MCP Servers Registry', 'https://github.com/modelcontextprotocol/servers', 'mcp_registry', 'weekly', '{"watch": "commits"}'),
  ('Claude Code GitHub', 'https://github.com/anthropics/claude-code', 'github_repo', 'daily', '{"watch": "releases"}'),
  ('Anthropic Cookbook', 'https://github.com/anthropics/anthropic-cookbook', 'github_repo', 'weekly', '{"watch": "commits"}'),
  ('Claude Code SDK Python', 'https://github.com/anthropics/claude-code-sdk-python', 'github_repo', 'weekly', '{"watch": "releases"}'),
  ('Claude Code SDK JS', 'https://github.com/anthropics/claude-code-sdk-js', 'github_repo', 'weekly', '{"watch": "releases"}');
