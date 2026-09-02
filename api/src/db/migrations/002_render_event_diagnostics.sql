-- Phase 5 needs to show *why* a render happened, not just its reason code.
-- 001_init.sql only stored props_diff, and only for avoidable renders — not
-- enough for the most common diagnostic case (props-changed) or for
-- context-changed renders at all. This is the first schema change since
-- Phase 0 — exactly what the migration runner (migrate.ts) exists for.

ALTER TABLE render_events ADD COLUMN IF NOT EXISTS reason_detail TEXT;
ALTER TABLE render_events ADD COLUMN IF NOT EXISTS context_diff JSONB;
