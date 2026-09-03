import type { Pool, PoolClient } from 'pg';

export interface Project {
  id: string;
  isActive: boolean;
}

export async function findProjectByApiKey(pool: Pool, apiKey: string): Promise<Project | null> {
  const prefix = apiKey.slice(0, 8);
  const { rows } = await pool.query<{ id: string; api_key: string; is_active: boolean }>(
    'SELECT id, api_key, is_active FROM projects WHERE api_key_prefix = $1',
    [prefix],
  );
  const match = rows.find((candidate) => candidate.api_key === apiKey);
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
  reasonDetail: string | null;
  propsDiff: string | null;
  contextDiff: string | null;
}

const RENDER_EVENT_COLUMNS = [
  'project_id',
  'session_id',
  'component_id',
  'ts',
  'duration_ms',
  'render_reason',
  'is_avoidable',
  'reason_detail',
  'props_diff',
  'context_diff',
];

export async function insertRenderEvents(
  pool: Pool,
  projectId: string,
  rows: RenderEventRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const columnsPerRow = RENDER_EVENT_COLUMNS.length;
  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, index) => {
    const base = index * columnsPerRow;
    const placeholders = Array.from(
      { length: columnsPerRow },
      (_, offset) => `$${base + offset + 1}`,
    );
    tuples.push(`(${placeholders.join(', ')})`);
    values.push(
      projectId,
      row.sessionId,
      row.componentId,
      row.ts,
      row.durationMs,
      row.renderReason,
      row.isAvoidable,
      row.reasonDetail,
      row.propsDiff,
      row.contextDiff,
    );
  });

  await pool.query(
    `INSERT INTO render_events (${RENDER_EVENT_COLUMNS.join(', ')})
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
  componentId: number;
  componentName: string;
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

  avoidableOnly?: boolean;
}

export async function listRenderEvents(
  pool: Pool,
  params: ListRenderEventsParams,
): Promise<RenderEventPageRow[]> {
  const limit = Math.min(params.limit ?? 100, 500);
  const conditions = ['r.session_id = $1'];
  const values: unknown[] = [params.sessionId];

  if (params.componentId !== undefined) {
    values.push(params.componentId);
    conditions.push(`r.component_id = $${values.length}`);
  }
  if (params.from) {
    values.push(params.from);
    conditions.push(`r.ts >= $${values.length}`);
  }
  if (params.to) {
    values.push(params.to);
    conditions.push(`r.ts < $${values.length}`);
  }
  if (params.avoidableOnly) {
    conditions.push('r.is_avoidable = true');
  }
  if (params.cursor) {
    values.push(params.cursor.ts, params.cursor.id);
    conditions.push(`(r.ts, r.id) < ($${values.length - 1}, $${values.length})`);
  }

  const { rows } = await pool.query<RenderEventPageRow>(
    `SELECT r.id, r.ts, r.duration_ms AS "durationMs", r.render_reason AS "renderReason",
            r.is_avoidable AS "isAvoidable", r.component_id AS "componentId", c.display_name AS "componentName"
     FROM render_events r
     JOIN components c ON c.id = r.component_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY r.ts DESC, r.id DESC
     LIMIT ${limit}`,
    values,
  );
  return rows;
}

export interface RenderEventDetailRow {
  id: string;
  ts: string;
  durationMs: number;
  renderReason: number;
  isAvoidable: boolean;
  componentId: number;
  componentName: string;
  reasonDetail: string | null;
  propsDiff: string | null;
  contextDiff: string | null;
}

export async function getRenderEventDetail(
  pool: Pool,
  projectId: string,
  sessionId: string,
  eventId: string,
  ts: string,
): Promise<RenderEventDetailRow | null> {
  const { rows } = await pool.query<RenderEventDetailRow>(
    `SELECT r.id, r.ts, r.duration_ms AS "durationMs", r.render_reason AS "renderReason",
            r.is_avoidable AS "isAvoidable", r.component_id AS "componentId", c.display_name AS "componentName",
            r.reason_detail AS "reasonDetail", r.props_diff AS "propsDiff", r.context_diff AS "contextDiff"
     FROM render_events r
     JOIN components c ON c.id = r.component_id
     JOIN sessions s ON s.id = r.session_id
     WHERE r.session_id = $1 AND r.ts = $2 AND r.id = $3 AND s.project_id = $4`,
    [sessionId, ts, eventId, projectId],
  );
  return rows[0] ?? null;
}

export interface RollupUpdate {
  sessionId: string;
  componentId: number;
  renderCount: number;
  avoidableCount: number;
  totalDurationMs: number;
  lastRenderAt: string;
}

export async function upsertSessionComponentRollup(
  pool: Pool,
  rollup: RollupUpdate,
): Promise<void> {
  await pool.query(
    `INSERT INTO session_component_rollups (session_id, component_id, render_count, avoidable_count, total_duration_ms, max_duration_ms, last_render_at)
     VALUES ($1, $2, $3, $4, $5, 0, $6)
     ON CONFLICT (session_id, component_id) DO UPDATE SET
       render_count = session_component_rollups.render_count + EXCLUDED.render_count,
       avoidable_count = session_component_rollups.avoidable_count + EXCLUDED.avoidable_count,
       total_duration_ms = session_component_rollups.total_duration_ms + EXCLUDED.total_duration_ms,
       last_render_at = GREATEST(session_component_rollups.last_render_at, EXCLUDED.last_render_at)`,
    [
      rollup.sessionId,
      rollup.componentId,
      rollup.renderCount,
      rollup.avoidableCount,
      rollup.totalDurationMs,
      rollup.lastRenderAt,
    ],
  );
}

export interface SessionSummaryRow {
  id: string;
  startedAt: string;
  endedAt: string | null;
  lastSeenAt: string;
  url: string | null;
  totalRenderCount: number;
  totalWastedMs: number;
}

export async function listSessions(
  pool: Pool,
  projectId: string,
  limit = 50,
): Promise<SessionSummaryRow[]> {
  const { rows } = await pool.query<SessionSummaryRow>(
    `SELECT id, started_at AS "startedAt", ended_at AS "endedAt", last_seen_at AS "lastSeenAt",
            url, total_render_count AS "totalRenderCount", total_wasted_ms AS "totalWastedMs"
     FROM sessions
     WHERE project_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [projectId, Math.min(limit, 200)],
  );
  return rows;
}

export interface ComponentSummaryRow {
  componentId: number;
  displayName: string;
  fiberPath: string;
  renderCount: number;
  avoidableCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastRenderAt: string;
}

export async function listSessionComponents(
  pool: Pool,
  projectId: string,
  sessionId: string,
): Promise<ComponentSummaryRow[]> {
  const { rows } = await pool.query<ComponentSummaryRow>(
    `SELECT c.id AS "componentId", c.display_name AS "displayName", c.fiber_path AS "fiberPath",
            r.render_count AS "renderCount", r.avoidable_count AS "avoidableCount",
            r.total_duration_ms AS "totalDurationMs", r.max_duration_ms AS "maxDurationMs",
            r.last_render_at AS "lastRenderAt"
     FROM session_component_rollups r
     JOIN components c ON c.id = r.component_id
     JOIN sessions s ON s.id = r.session_id
     WHERE r.session_id = $1 AND s.project_id = $2
     ORDER BY r.render_count DESC`,
    [sessionId, projectId],
  );
  return rows;
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

export interface LongTaskEventRow {
  sessionId: string;
  ts: string;
  durationMs: number;
  attribution: string[];
}

const LONG_TASK_EVENT_COLUMNS = ['project_id', 'session_id', 'ts', 'duration_ms', 'attribution'];

export async function insertLongTaskEvents(
  pool: Pool,
  projectId: string,
  rows: LongTaskEventRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const columnsPerRow = LONG_TASK_EVENT_COLUMNS.length;
  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, index) => {
    const base = index * columnsPerRow;
    const placeholders = Array.from(
      { length: columnsPerRow },
      (_, offset) => `$${base + offset + 1}`,
    );
    tuples.push(`(${placeholders.join(', ')})`);
    values.push(projectId, row.sessionId, row.ts, row.durationMs, row.attribution);
  });

  await pool.query(
    `INSERT INTO long_task_events (${LONG_TASK_EVENT_COLUMNS.join(', ')})
     VALUES ${tuples.join(', ')}`,
    values,
  );
}

export interface NetworkRequestEventRow {
  sessionId: string;
  ts: string;
  url: string;
  method: string;
  status: number | null;
  durationMs: number;
  initiatorType: string;
  transferSize: number | null;
}

const NETWORK_REQUEST_EVENT_COLUMNS = [
  'project_id',
  'session_id',
  'ts',
  'url',
  'method',
  'status',
  'duration_ms',
  'initiator_type',
  'transfer_size',
];

export async function insertNetworkRequestEvents(
  pool: Pool,
  projectId: string,
  rows: NetworkRequestEventRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const columnsPerRow = NETWORK_REQUEST_EVENT_COLUMNS.length;
  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, index) => {
    const base = index * columnsPerRow;
    const placeholders = Array.from(
      { length: columnsPerRow },
      (_, offset) => `$${base + offset + 1}`,
    );
    tuples.push(`(${placeholders.join(', ')})`);
    values.push(
      projectId,
      row.sessionId,
      row.ts,
      row.url,
      row.method,
      row.status,
      row.durationMs,
      row.initiatorType,
      row.transferSize,
    );
  });

  await pool.query(
    `INSERT INTO network_request_events (${NETWORK_REQUEST_EVENT_COLUMNS.join(', ')})
     VALUES ${tuples.join(', ')}`,
    values,
  );
}

export interface LongTaskEventPageRow {
  id: string;
  ts: string;
  durationMs: number;
  attribution: string[];
  correlatedComponentNames: string[];
}

export interface ListLongTaskEventsParams {
  sessionId: string;
  cursor?: PageCursor;
  limit?: number;
}

async function correlateLongTasksWithComponents(
  pool: Pool,
  sessionId: string,
  tasks: Array<{ id: string; ts: string; durationMs: number }>,
): Promise<Map<string, string[]>> {
  if (tasks.length === 0) return new Map();

  const { rows } = await pool.query<{ taskId: string; componentNames: string[] }>(
    `SELECT lt.id AS "taskId", array_agg(DISTINCT c.display_name) AS "componentNames"
     FROM UNNEST($2::bigint[], $3::timestamptz[], $4::double precision[]) AS lt(id, ts, duration_ms)
     JOIN render_events r
       ON r.session_id = $1
      AND r.ts >= lt.ts
      AND r.ts <= lt.ts + make_interval(secs => lt.duration_ms / 1000.0)
     JOIN components c ON c.id = r.component_id
     GROUP BY lt.id`,
    [
      sessionId,
      tasks.map((task) => task.id),
      tasks.map((task) => task.ts),
      tasks.map((task) => task.durationMs),
    ],
  );

  const byTaskId = new Map<string, string[]>();
  for (const row of rows) byTaskId.set(row.taskId, row.componentNames);
  return byTaskId;
}

export async function listLongTaskEvents(
  pool: Pool,
  params: ListLongTaskEventsParams,
): Promise<LongTaskEventPageRow[]> {
  const limit = Math.min(params.limit ?? 100, 500);
  const conditions = ['session_id = $1'];
  const values: unknown[] = [params.sessionId];

  if (params.cursor) {
    values.push(params.cursor.ts, params.cursor.id);
    conditions.push(`(ts, id) < ($${values.length - 1}, $${values.length})`);
  }

  const { rows } = await pool.query<{
    id: string;
    ts: string;
    durationMs: number;
    attribution: string[];
  }>(
    `SELECT id, ts, duration_ms AS "durationMs", attribution
     FROM long_task_events
     WHERE ${conditions.join(' AND ')}
     ORDER BY ts DESC, id DESC
     LIMIT ${limit}`,
    values,
  );
  if (rows.length === 0) return [];

  const correlated = await correlateLongTasksWithComponents(pool, params.sessionId, rows);
  return rows.map((row) => ({
    ...row,
    correlatedComponentNames: correlated.get(row.id) ?? [],
  }));
}

export interface NetworkRequestEventPageRow {
  id: string;
  ts: string;
  url: string;
  method: string;
  status: number | null;
  durationMs: number;
  initiatorType: string;
  transferSize: number | null;
}

export interface ListNetworkRequestEventsParams {
  sessionId: string;
  cursor?: PageCursor;
  limit?: number;
}

export async function listNetworkRequestEvents(
  pool: Pool,
  params: ListNetworkRequestEventsParams,
): Promise<NetworkRequestEventPageRow[]> {
  const limit = Math.min(params.limit ?? 100, 500);
  const conditions = ['session_id = $1'];
  const values: unknown[] = [params.sessionId];

  if (params.cursor) {
    values.push(params.cursor.ts, params.cursor.id);
    conditions.push(`(ts, id) < ($${values.length - 1}, $${values.length})`);
  }

  const { rows } = await pool.query<NetworkRequestEventPageRow>(
    `SELECT id, ts, url, method, status, duration_ms AS "durationMs",
            initiator_type AS "initiatorType", transfer_size AS "transferSize"
     FROM network_request_events
     WHERE ${conditions.join(' AND ')}
     ORDER BY ts DESC, id DESC
     LIMIT ${limit}`,
    values,
  );
  return rows;
}
