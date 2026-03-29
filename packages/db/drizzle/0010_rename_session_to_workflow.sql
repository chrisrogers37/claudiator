-- Rename domain "session" to "workflow" in skill_categories
UPDATE skill_categories
SET domain = 'workflow',
    slug = REPLACE(slug, 'session-', 'workflow-'),
    description = REPLACE(description, 'session domain', 'workflow domain'),
    updated_at = NOW()
WHERE domain = 'session';
