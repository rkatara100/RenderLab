-- Core schema (ARCHITECTURE.md §3.1). IF NOT EXISTS everywhere so this file
-- is safely re-runnable — see migrate.ts for why a single idempotent file
-- stands in for a versioned migration framework in Phase 2.

CREATE TABLE IF NOT EXISTS projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    api_key         TEXT NOT NULL UNIQUE,
    api_key_prefix  TEXT NOT NULL,
    owner_email     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active       BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_projects_api_key_prefix ON projects (api_key_prefix);

CREATE TABLE IF NOT EXISTS sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sdk_session_key     TEXT NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL,
    ended_at            TIMESTAMPTZ,
    last_seen_at        TIMESTAMPTZ NOT NULL,
    user_agent          TEXT,
    url                 TEXT,
    app_version         TEXT,
    total_render_count  BIGINT NOT NULL DEFAULT 0,
    total_wasted_ms     DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_project_sdk_key ON sessions (project_id, sdk_session_key);
CREATE INDEX IF NOT EXISTS idx_sessions_project_started_at ON sessions (project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_live ON sessions (project_id, last_seen_at) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS components (
    id              BIGSERIAL PRIMARY KEY,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    fiber_path_hash TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    fiber_path      TEXT NOT NULL,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_components_project_hash ON components (project_id, fiber_path_hash);

CREATE TABLE IF NOT EXISTS render_events (
    id              BIGINT GENERATED ALWAYS AS IDENTITY,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    component_id    BIGINT NOT NULL REFERENCES components(id),
    ts              TIMESTAMPTZ NOT NULL,
    duration_ms     DOUBLE PRECISION NOT NULL,
    render_reason   SMALLINT NOT NULL, -- 1=mount 2=props-changed 3=state-changed 4=context-changed 5=parent-rerender 6=unknown
    is_avoidable    BOOLEAN NOT NULL DEFAULT false,
    props_diff      JSONB,
    PRIMARY KEY (ts, id)
) PARTITION BY RANGE (ts);
-- Daily partitions are created dynamically by partitions.ts, not baked in here.

CREATE INDEX IF NOT EXISTS idx_render_events_session_ts ON render_events (session_id, ts);
CREATE INDEX IF NOT EXISTS idx_render_events_component ON render_events (project_id, component_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_render_events_avoidable ON render_events (session_id, ts) WHERE is_avoidable = true;

CREATE TABLE IF NOT EXISTS session_component_rollups (
    session_id          UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    component_id        BIGINT NOT NULL REFERENCES components(id),
    render_count        INTEGER NOT NULL DEFAULT 0,
    avoidable_count      INTEGER NOT NULL DEFAULT 0,
    total_duration_ms    DOUBLE PRECISION NOT NULL DEFAULT 0,
    max_duration_ms      DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_render_at       TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (session_id, component_id)
);
CREATE INDEX IF NOT EXISTS idx_rollups_session_count ON session_component_rollups (session_id, render_count DESC);

CREATE TABLE IF NOT EXISTS render_events_daily_rollup (
    project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    component_id     BIGINT NOT NULL REFERENCES components(id),
    day              DATE NOT NULL,
    render_count     BIGINT NOT NULL DEFAULT 0,
    avoidable_count  BIGINT NOT NULL DEFAULT 0,
    avg_duration_ms  DOUBLE PRECISION NOT NULL DEFAULT 0,
    p95_duration_ms  DOUBLE PRECISION,
    session_count    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, component_id, day)
);
