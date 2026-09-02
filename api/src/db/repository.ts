import type { Pool, PoolClient } from 'pg';

export interface Project {
  id: string;
  isActive: boolean;
}

/**
 * Prefix-indexed lookup then full-key compare among candidates
 * (ARCHITECTURE.md §3.4) — avoids a full-table scan while still comparing
 * the complete key, not just the prefix.
 */
export async function findProjectByApiKey(pool: Pool, apiKey: string): Promise<Project | null> {
  const prefix = apiKey.slice(0, 8);
  const { rows } = await pool.query<{ id: string; api_key: string; is_active: boolean }>(
    'SELECT id, api_key, is_active FROM projects WHERE api_key_prefix = $1',
    [prefix],
  );
  const match = rows.find((r) => r.api_key === apiKey);
  return match ? { id: match.id, isActive: match.is_active } : null;
}

export interface SessionInput {
  projectId: string;
  sdkSessionKey: string;
  startedAt: string;
  url?: string | undefined;
  userAgent?: string | undefined;
  appVersion?: string | undefined;
}

/** Idempotent per (project, sdk_session_key) — safe under SDK batch retry
 * and doubles as the session heartbeat (`last_seen_at`). */
export async function upsertSession(pool: Pool, input: SessionInput): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sessions (project_id, sdk_session_key, started_at, last_seen_at, url, user_agent, app_version)
     VALUES ($1, $2, $3, now(), $4, $5, $6)
     ON CONFLICT (project_id, sdk_session_key) DO UPDATE SET last_seen_at = now()
     RETURNING id`,
    [
      input.projectId,
      input.sdkSessionKey,
      input.startedAt,
      input.url ?? null,
      input.userAgent ?? null,
      input.appVersion ?? null,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertSession: INSERT ... RETURNING produced no row');
  return row.id;
}

export async function endSession(
  pool: Pool,
  projectId: string,
  sdkSessionKey: string,
): Promise<void> {
  await pool.query(
    'UPDATE sessions SET ended_at = now() WHERE project_id = $1 AND sdk_session_key = $2',
    [projectId, sdkSessionKey],
  );
}

/**
 * Dedupes by (project, fiber_path_hash). Phase 2 simplification: hashed on
 * `componentName` alone, not full ancestor-path position — the SDK's
 * `componentId` includes a per-mount instance counter (ARCHITECTURE.md §8.8),
 * which isn't stable across sessions, so it can't be used as the identity
 * key without an SDK change to expose a stable, name-based structural path.
 * Consequence: two distinct instances of the same component type (e.g. two
 * `SearchBox` in different parts of the tree) are aggregated together for
 * now. Flagged explicitly, not silently — full path-based identity is a
 * natural Phase 6/8 refinement once the SDK sends stable ancestor names.
 */
export async function upsertComponent(
  pool: Pool | PoolClient,
  projectId: string,
  componentName: string,
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO components (project_id, fiber_path_hash, display_name, fiber_path)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (project_id, fiber_path_hash) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id`,
    [projectId, componentName, componentName],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertComponent: INSERT ... RETURNING produced no row');
  return row.id;
}

export interface RenderEventRow {
  sessionId: string;
  componentId: number;
  ts: string;
  durationMs: number;
  renderReason: number;
  isAvoidable: boolean;
  propsDiff: string | null;
}

/** Single multi-row INSERT per batch — the SDK batches up to 250 events
 * (ARCHITECTURE.md §3.4), so this is one round-trip per flush, not one per
 * event. Ordering is reconstructed at read time via `ts`, not insertion
 * order, so no separate per-row sequence column is needed here. */
export async function insertRenderEvents(
  pool: Pool,
  projectId: string,
  rows: RenderEventRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((r, i) => {
    const base = i * 8;
    tuples.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`,
    );
    values.push(
      projectId,
      r.sessionId,
      r.componentId,
      r.ts,
      r.durationMs,
      r.renderReason,
      r.isAvoidable,
      r.propsDiff,
    );
  });

  await pool.query(
    `INSERT INTO render_events (project_id, session_id, component_id, ts, duration_ms, render_reason, is_avoidable, props_diff)
     VALUES ${tuples.join(', ')}`,
    values,
  );
}

export interface RenderEventPageRow {
  id: string;
  ts: string;
  durationMs: number;
  renderReason: number;
  isAvoidable: boolean;
}

export interface PageCursor {
  ts: string;
  id: string;
}

export interface ListRenderEventsParams {
  sessionId: string;
  componentId?: number;
  cursor?: PageCursor;
  limit?: number;
  from?: string;
  to?: string;
}

/** Keyset pagination on (ts, id) — never OFFSET (ARCHITECTURE.md §3.2): cost
 * is O(page size) at any depth via the existing (session_id, ts) index,
 * unlike OFFSET which degrades linearly with page depth. */
export async function listRenderEvents(
  pool: Pool,
  params: ListRenderEventsParams,
): Promise<RenderEventPageRow[]> {
  const limit = Math.min(params.limit ?? 100, 500);
  const conditions = ['session_id = $1'];
  const values: unknown[] = [params.sessionId];

  if (params.componentId !== undefined) {
    values.push(params.componentId);
    conditions.push(`component_id = $${values.length}`);
  }
  if (params.from) {
    values.push(params.from);
    conditions.push(`ts >= $${values.length}`);
  }
  if (params.to) {
    values.push(params.to);
    conditions.push(`ts < $${values.length}`);
  }
  if (params.cursor) {
    values.push(params.cursor.ts, params.cursor.id);
    conditions.push(`(ts, id) < ($${values.length - 1}, $${values.length})`);
  }

  const { rows } = await pool.query<RenderEventPageRow>(
    `SELECT id, ts, duration_ms AS "durationMs", render_reason AS "renderReason", is_avoidable AS "isAvoidable"
     FROM render_events
     WHERE ${conditions.join(' AND ')}
     ORDER BY ts DESC, id DESC
     LIMIT ${limit}`,
    values,
  );
  return rows;
}

export interface RollupUpdate {
  sessionId: string;
  componentId: number;
  renderCount: number;
  avoidableCount: number;
  totalDurationMs: number;
  lastRenderAt: string;
}

/** Additive upsert — the flush job (redis/flushJob.ts) calls this with only
 * the increment since the last flush, not a running total, so `+ EXCLUDED.*`
 * is correct here (not a plain overwrite). `max_duration_ms` isn't updated
 * here — see flushJob.ts for why it isn't hot-tracked in Phase 2. */
export async function upsertSessionComponentRollup(pool: Pool, r: RollupUpdate): Promise<void> {
  await pool.query(
    `INSERT INTO session_component_rollups (session_id, component_id, render_count, avoidable_count, total_duration_ms, max_duration_ms, last_render_at)
     VALUES ($1, $2, $3, $4, $5, 0, $6)
     ON CONFLICT (session_id, component_id) DO UPDATE SET
       render_count = session_component_rollups.render_count + EXCLUDED.render_count,
       avoidable_count = session_component_rollups.avoidable_count + EXCLUDED.avoidable_count,
       total_duration_ms = session_component_rollups.total_duration_ms + EXCLUDED.total_duration_ms,
       last_render_at = GREATEST(session_component_rollups.last_render_at, EXCLUDED.last_render_at)`,
    [
      r.sessionId,
      r.componentId,
      r.renderCount,
      r.avoidableCount,
      r.totalDurationMs,
      r.lastRenderAt,
    ],
  );
}

export async function updateSessionTotals(
  pool: Pool,
  sessionId: string,
  addRenderCount: number,
  addWastedMs: number,
): Promise<void> {
  await pool.query(
    'UPDATE sessions SET total_render_count = total_render_count + $2, total_wasted_ms = total_wasted_ms + $3 WHERE id = $1',
    [sessionId, addRenderCount, addWastedMs],
  );
}
