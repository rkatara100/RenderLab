import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { ensureDailyPartition, rollupAndDropPartition } from '../src/db/partitions.js';
import { createFakePool } from './fakes.js';

describe('ensureDailyPartition', () => {
  it('creates an IF NOT EXISTS partition named and bounded by the given date', async () => {
    const fake = createFakePool();
    await ensureDailyPartition(fake as unknown as Pool, new Date('2026-03-15T12:00:00.000Z'));

    const sql = fake.calls[0]?.text ?? '';
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS render_events_2026_03_15');
    expect(sql).toContain("FOR VALUES FROM ('2026-03-15') TO ('2026-03-16')");
  });
});

describe('rollupAndDropPartition', () => {
  it('rolls the day up into render_events_daily_rollup, then drops the raw partition', async () => {
    const fake = createFakePool();
    await rollupAndDropPartition(fake as unknown as Pool, new Date('2026-03-15T00:00:00.000Z'));

    expect(fake.calls[0]?.text).toContain('INSERT INTO render_events_daily_rollup');
    expect(fake.calls[0]?.text).toContain('FROM render_events_2026_03_15');
    expect(fake.calls[0]?.params).toEqual(['2026-03-15']);
    expect(fake.calls[1]?.text).toBe('DROP TABLE IF EXISTS render_events_2026_03_15');
  });
});
