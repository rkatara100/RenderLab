import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  ensureDailyPartition,
  rollupAndDropPartition,
} from '../../src/db/partitions.js';
import {
  createProject,
  upsertSession,
  upsertComponent,
  insertRenderEvents,
} from '../../src/db/repository.js';
import { getIntegrationPool, resetDatabase, closeIntegrationPool } from './helpers.js';

async function partitionExists(pool: ReturnType<typeof getIntegrationPool>, name: string) {
  const { rows } = await pool.query<{ exists: string | null }>('SELECT to_regclass($1) AS exists', [
    name,
  ]);
  return rows[0]?.exists !== null && rows[0]?.exists !== undefined;
}

describe('partitions against a real Postgres instance', () => {
  afterEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await closeIntegrationPool();
  });

  it('creates a real, queryable partition for the given date', async () => {
    const pool = getIntegrationPool();
    const date = new Date('2098-03-10T00:00:00.000Z');

    await ensureDailyPartition(pool, date);

    expect(await partitionExists(pool, 'render_events_2098_03_10')).toBe(true);
  });

  it('is safe to call twice for the same date (CREATE TABLE IF NOT EXISTS)', async () => {
    const pool = getIntegrationPool();
    const date = new Date('2098-03-11T00:00:00.000Z');

    await ensureDailyPartition(pool, date);
    await expect(ensureDailyPartition(pool, date)).resolves.toBeUndefined();
  });

  it('rolls up real rows into the daily aggregate and drops the source partition', async () => {
    const pool = getIntegrationPool();
    const date = new Date('2098-03-12T00:00:00.000Z');
    await ensureDailyPartition(pool, date);

    const project = await createProject(pool, 'Rollup Test', 'owner@example.com');
    const sessionId = await upsertSession(pool, {
      projectId: project.id,
      sdkSessionKey: 'sess-rollup',
      startedAt: date.toISOString(),
    });
    const componentId = await upsertComponent(pool, project.id, 'RollupComponent');

    await insertRenderEvents(pool, project.id, [
      {
        sessionId,
        componentId,
        ts: '2098-03-12T10:00:00.000Z',
        durationMs: 4,
        renderReason: 1,
        isAvoidable: true,
        reasonDetail: null,
        propsDiff: null,
        contextDiff: null,
        phase: 1,
        componentPath: ['RollupComponent#0'],
        commitTime: 1,
      },
      {
        sessionId,
        componentId,
        ts: '2098-03-12T11:00:00.000Z',
        durationMs: 8,
        renderReason: 2,
        isAvoidable: false,
        reasonDetail: null,
        propsDiff: null,
        contextDiff: null,
        phase: 2,
        componentPath: ['RollupComponent#0'],
        commitTime: 2,
      },
    ]);

    await rollupAndDropPartition(pool, date);

    expect(await partitionExists(pool, 'render_events_2098_03_12')).toBe(false);

    const { rows } = await pool.query<{
      render_count: string;
      avoidable_count: string;
      session_count: string;
    }>(
      `SELECT render_count, avoidable_count, session_count FROM render_events_daily_rollup
       WHERE project_id = $1 AND component_id = $2 AND day = $3`,
      [project.id, componentId, '2098-03-12'],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.render_count)).toBe(2);
    expect(Number(rows[0]?.avoidable_count)).toBe(1);
    expect(Number(rows[0]?.session_count)).toBe(1);
  });

  it('does nothing when asked to roll up a partition that was never created', async () => {
    const pool = getIntegrationPool();
    await expect(
      rollupAndDropPartition(pool, new Date('2098-03-13T00:00:00.000Z')),
    ).resolves.toBeUndefined();
  });
});
