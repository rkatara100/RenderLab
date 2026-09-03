CREATE TABLE IF NOT EXISTS long_task_events (
    id              BIGSERIAL PRIMARY KEY,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    ts              TIMESTAMPTZ NOT NULL,
    duration_ms     DOUBLE PRECISION NOT NULL,
    attribution     TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_long_task_events_session_ts ON long_task_events (session_id, ts);

CREATE TABLE IF NOT EXISTS network_request_events (
    id              BIGSERIAL PRIMARY KEY,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    ts              TIMESTAMPTZ NOT NULL,
    url             TEXT NOT NULL,
    method          TEXT NOT NULL,
    status          INTEGER,
    duration_ms     DOUBLE PRECISION NOT NULL,
    initiator_type  TEXT NOT NULL,
    transfer_size   BIGINT
);
CREATE INDEX IF NOT EXISTS idx_network_request_events_session_ts ON network_request_events (session_id, ts);
