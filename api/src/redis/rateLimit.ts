import type { RedisLike } from './hotPath.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  redis: RedisLike,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const count = await redis.incrby(key, 1);
  await redis.expire(key, windowSeconds);

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: windowSeconds,
  };
}
