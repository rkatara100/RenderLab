import { describe, expect, it } from 'vitest';
import { isDuplicateBatch, recordBatchHotPath } from '../src/redis/hotPath.js';
import { redisKeys } from '../src/redis/keys.js';
import { createTestRedis } from './doubles.js';

describe('recordBatchHotPath', () => {
  it('refreshes presence and increments the rolling render counter by batch size', async () => {
    const redis = createTestRedis();
    await recordBatchHotPath(redis, 'p1', 's1', [
      { componentId: 1, durationMs: 0.5, isAvoidable: false },
      { componentId: 1, durationMs: 1, isAvoidable: false },
    ]);

    expect(redis.store.get(redisKeys.presence('p1', 's1'))).toBeTypeOf('number');
    expect(redis.store.get(redisKeys.renderCount('p1', 's1'))).toBe(2);
  });

  it('increments per-component counts/duration, and avoidable counts only when isAvoidable', async () => {
    const redis = createTestRedis();
    await recordBatchHotPath(redis, 'p1', 's1', [
      { componentId: 7, durationMs: 2, isAvoidable: true },
      { componentId: 7, durationMs: 3, isAvoidable: false },
    ]);

    const counts = await redis.hgetall(redisKeys.componentCounts('p1', 's1'));
    const avoidable = await redis.hgetall(redisKeys.componentAvoidableCounts('p1', 's1'));
    const duration = await redis.hgetall(redisKeys.componentDurationMs('p1', 's1'));

    expect(counts?.['7']).toBe('2');
    expect(avoidable?.['7']).toBe('1');
    expect(Number(duration?.['7'])).toBe(5000);
  });

  it('is a no-op beyond presence refresh for an empty batch', async () => {
    const redis = createTestRedis();
    await recordBatchHotPath(redis, 'p1', 's1', []);
    expect(redis.store.has(redisKeys.renderCount('p1', 's1'))).toBe(false);
  });
});

describe('isDuplicateBatch', () => {
  it('returns false the first time a batch_id is seen, true on replay', async () => {
    const redis = createTestRedis();
    expect(await isDuplicateBatch(redis, 'p1', 'batch-1')).toBe(false);
    expect(await isDuplicateBatch(redis, 'p1', 'batch-1')).toBe(true);
  });

  it('treats different batch_ids independently', async () => {
    const redis = createTestRedis();
    expect(await isDuplicateBatch(redis, 'p1', 'batch-1')).toBe(false);
    expect(await isDuplicateBatch(redis, 'p1', 'batch-2')).toBe(false);
  });
});
