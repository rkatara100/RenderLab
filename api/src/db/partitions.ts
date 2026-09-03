import type { Pool } from 'pg';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function partitionName(date: Date): string {
  return `render_events_${isoDate(date).replaceAll('-', '_')}`;
}

export async function ensureDailyPartition(pool: Pool, date: Date = new Date()): Promise<void> {
  const name = partitionName(date);
  const start = isoDate(date);
  const end = isoDate(new Date(date.getTime() + 86_400_000));
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF render_events FOR VALUES FROM ('${start}') TO ('${end}')`,
  );
}

export async function rollupAndDropPartition(pool: Pool, date: Date): Promise<void> {
  const name = partitionName(date);
  const day = isoDate(date);

  const { rows } = await pool.query<{ exists: string | null }>('SELECT to_regclass($1) AS exists', [
    name,
  ]);
  if (!rows[0]?.exists) return;

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

export async function rollupAndDropExpiredPartitions(
  pool: Pool,
  retentionDays = 7,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  await rollupAndDropPartition(pool, cutoff);
}
