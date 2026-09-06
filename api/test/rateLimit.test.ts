import { describe, expect, it } from 'vitest';
import { checkRateLimit } from '../src/redis/rateLimit.js';
import { createTestRedis } from './doubles.js';

describe('checkRateLimit', () => {
  it('allows requests up to the limit and denies the one after', async () => {
    const redis = createTestRedis();

    for (let i = 1; i <= 3; i += 1) {
      const result = await checkRateLimit(redis, 'k', 3, 60);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3 - i);
    }

    const denied = await checkRateLimit(redis, 'k', 3, 60);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it('rolls the window over even under sustained traffic', async () => {
    const redis = createTestRedis();

    for (let i = 0; i < 3; i += 1) {
      await checkRateLimit(redis, 'k', 3, 60);
    }
    expect((await checkRateLimit(redis, 'k', 3, 60)).allowed).toBe(false);

    for (let elapsed = 0; elapsed < 50; elapsed += 10) {
      redis.advanceTimeBy(10_000);
      const during = await checkRateLimit(redis, 'k', 3, 60);
      expect(during.allowed).toBe(false);
    }

    redis.advanceTimeBy(20_000);
    const afterWindow = await checkRateLimit(redis, 'k', 3, 60);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(2);
  });

  it('does not refresh the ttl on subsequent requests in the same window', async () => {
    const redis = createTestRedis();

    const first = await checkRateLimit(redis, 'k', 10, 60);
    expect(first.retryAfterSeconds).toBe(60);

    redis.advanceTimeBy(30_000);
    const later = await checkRateLimit(redis, 'k', 10, 60);
    expect(later.retryAfterSeconds).toBe(30);
  });

  it('reports the real remaining ttl as retry-after', async () => {
    const redis = createTestRedis();

    await checkRateLimit(redis, 'k', 1, 100);
    redis.advanceTimeBy(40_000);

    const denied = await checkRateLimit(redis, 'k', 1, 100);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(60);
  });

  it('fails open and flags degradation when redis is unavailable', async () => {
    const redis = createTestRedis();
    redis.failNextEval();

    const result = await checkRateLimit(redis, 'k', 1, 60);

    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.retryAfterSeconds).toBe(60);
  });

  it('counts each key independently', async () => {
    const redis = createTestRedis();

    await checkRateLimit(redis, 'a', 1, 60);
    const other = await checkRateLimit(redis, 'b', 1, 60);

    expect(other.allowed).toBe(true);
  });
});
