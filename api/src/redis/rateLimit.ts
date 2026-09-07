import type { RedisLike } from './hotPath.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  degraded: boolean;
}

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCRBY', KEYS[1], 1)
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

function parseScriptResult(raw: unknown): { count: number; ttl: number } | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const count = Number(raw[0]);
  const ttl = Number(raw[1]);
  if (!Number.isFinite(count) || !Number.isFinite(ttl)) return null;
  return { count, ttl };
}

export async function checkRateLimit(
  redis: RedisLike,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  let parsed: { count: number; ttl: number } | null = null;

  try {
    parsed = parseScriptResult(await redis.eval(FIXED_WINDOW_SCRIPT, [key], [windowSeconds]));
  } catch {
    parsed = null;
  }

  if (parsed === null) {
    return {
      allowed: true,
      limit,
      remaining: limit,
      retryAfterSeconds: windowSeconds,
      degraded: true,
    };
  }

  return {
    allowed: parsed.count <= limit,
    limit,
    remaining: Math.max(0, limit - parsed.count),
    retryAfterSeconds: parsed.ttl > 0 ? parsed.ttl : windowSeconds,
    degraded: false,
  };
}
