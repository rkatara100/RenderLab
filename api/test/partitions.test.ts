import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { ensureDailyPartition, rollupAndDropPartition } from '../src/db/partitions.js';
import { createTestPool } from './doubles.js';

describe('ensureDailyPartition', () => {
  it('creates an IF NOT EXISTS partition named and bounded by the given date', async () => {
    const pool = createTestPool();
    await ensureDailyPartition(pool as unknown as Pool, new Date('2026-03-15T12:00:00.000Z'));

    const sql = pool.calls[0]?.text ?? '';
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS render_events_2026_03_15');
    expect(sql).toContain("FOR VALUES FROM ('2026-03-15') TO ('2026-03-16')");
  });
});

describe('rollupAndDropPartition', () => {
  it('rolls the day up into render_events_daily_rollup, then drops the raw partition', async () => {
    const pool = createTestPool((text) =>
      text.includes('to_regclass') ? { rows: [{ exists: 'render_events_2026_03_15' }] } : { rows: [] },
    );
    await rollupAndDropPartition(pool as unknown as Pool, new Date('2026-03-15T00:00:00.000Z'));

    expect(pool.calls[1]?.text).toContain('INSERT INTO render_events_daily_rollup');
    expect(pool.calls[1]?.text).toContain('FROM render_events_2026_03_15');
    expect(pool.calls[1]?.params).toEqual(['2026-03-15']);
    expect(pool.calls[2]?.text).toBe('DROP TABLE IF EXISTS render_events_2026_03_15');
  });

  it('skips the rollup entirely when the partition does not exist', async () => {
    const pool = createTestPool();
    await rollupAndDropPartition(pool as unknown as Pool, new Date('2026-03-15T00:00:00.000Z'));

    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0]?.text).toBe('SELECT to_regclass($1) AS exists');
  });
});
