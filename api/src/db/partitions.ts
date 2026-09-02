import type { Pool } from 'pg';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Table names are derived only from internal `Date` objects, never request
 * input — safe to interpolate directly (DDL doesn't support parameterized
 * identifiers). */
function partitionName(date: Date): string {
  return `render_events_${isoDate(date).replaceAll('-', '_')}`;
}

/**
 * Creates a day's `render_events` partition if it doesn't exist yet.
 * Idempotent — safe to call on every ingest-service boot or from a daily
 * cron (ARCHITECTURE.md §3.1/§3.5: partition management via a scheduled job,
 * not pg_partman).
 */
export async function ensureDailyPartition(pool: Pool, date: Date = new Date()): Promise<void> {
  const name = partitionName(date);
  const start = isoDate(date);
  const end = isoDate(new Date(date.getTime() + 86_400_000));
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF render_events FOR VALUES FROM ('${start}') TO ('${end}')`,
  );
}

/**
 * Retention (ARCHITECTURE.md §3.2): rolls a day's raw render_events into
 * render_events_daily_rollup, then drops the partition — a `DROP TABLE`,
 * not a `DELETE`, so no vacuum storm on the hot table.
 */
export async function rollupAndDropPartition(pool: Pool, date: Date): Promise<void> {
  const name = partitionName(date);
  const day = isoDate(date);

  await pool.query(
    `INSERT INTO render_events_daily_rollup
       (project_id, component_id, day, render_count, avoidable_count, avg_duration_ms, p95_duration_ms, session_count)
     SELECT project_id, component_id, $1::date,
            COUNT(*), COUNT(*) FILTER (WHERE is_avoidable),
            AVG(duration_ms), PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms),
            COUNT(DISTINCT session_id)
     FROM ${name}
     GROUP BY project_id, component_id
     ON CONFLICT (project_id, component_id, day) DO UPDATE SET
       render_count = EXCLUDED.render_count,
       avoidable_count = EXCLUDED.avoidable_count,
       avg_duration_ms = EXCLUDED.avg_duration_ms,
       p95_duration_ms = EXCLUDED.p95_duration_ms,
       session_count = EXCLUDED.session_count`,
    [day],
  );

  await pool.query(`DROP TABLE IF EXISTS ${name}`);
}

/** Retention window is 7 days (ARCHITECTURE.md §3.2, table). Call once a day. */
export async function rollupAndDropExpiredPartitions(
  pool: Pool,
  retentionDays = 7,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  await rollupAndDropPartition(pool, cutoff);
}
