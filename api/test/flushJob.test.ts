import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { flushSessionRollup } from '../src/redis/flushJob.js';
import { recordBatchHotPath } from '../src/redis/hotPath.js';
import { redisKeys } from '../src/redis/keys.js';
import { createTestPool, createTestRedis } from './doubles.js';

describe('flushSessionRollup', () => {
  it('upserts one rollup row per component and updates session totals, then clears the hashes', async () => {
    const redis = createTestRedis();
    await recordBatchHotPath(redis, 'p1', 's1', [
      { componentId: 1, durationMs: 2, isAvoidable: true },
      { componentId: 2, durationMs: 3, isAvoidable: false },
    ]);

    const pool = createTestPool();
    await flushSessionRollup(pool as unknown as Pool, redis, 'p1', 's1');

    const rollupCalls = pool.calls.filter((c) => c.text.includes('session_component_rollups'));
    const sessionUpdateCalls = pool.calls.filter((c) => c.text.includes('UPDATE sessions'));

    expect(rollupCalls).toHaveLength(2);
    expect(sessionUpdateCalls).toHaveLength(1);
    expect(sessionUpdateCalls[0]?.params).toEqual(['s1', 2, 2]);

    expect(await redis.hgetall(redisKeys.componentCounts('p1', 's1'))).toBeNull();
  });

  it('is a no-op when there is nothing to flush', async () => {
    const redis = createTestRedis();
    const pool = createTestPool();
    await flushSessionRollup(pool as unknown as Pool, redis, 'p1', 's1');
    expect(pool.calls).toHaveLength(0);
  });
});
