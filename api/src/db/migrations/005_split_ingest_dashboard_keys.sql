ALTER TABLE projects RENAME COLUMN api_key TO api_key_hash;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS dashboard_key_hash TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS dashboard_key_prefix TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_dashboard_key_prefix ON projects (dashboard_key_prefix);
