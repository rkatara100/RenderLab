import { redisKeys } from './keys.js';

/** The minimal subset of the Upstash Redis client this module needs — lets
 * tests substitute a plain fake instead of a real REST-backed client. The
 * real `Redis` class from `@upstash/redis` satisfies this structurally. */
export interface RedisLike {
  set: (key: string, value: string | number, opts?: { ex?: number; nx?: true }) => Promise<unknown>;
  incrby: (key: string, amount: number) => Promise<number>;
  hincrby: (key: string, field: string, amount: number) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  hgetall: (key: string) => Promise<Record<string, string> | null>;
  del: (...keys: string[]) => Promise<number>;
}

export interface HotPathEvent {
  componentId: number;
  durationMs: number;
  isAvoidable: boolean;
}

const SESSION_KEY_TTL_SECONDS = 3600;
const PRESENCE_TTL_SECONDS = 60;

/**
 * Updates the live-dashboard hot keys for one ingested batch
 * (ARCHITECTURE.md §3.3): presence TTL (liveness signal), a rolling session
 * render counter, and per-component count/duration/avoidable-count hashes
 * that `flushJob.ts` periodically upserts into Postgres. Duration is stored
 * as integer microseconds (`HINCRBY` is integer-only) to avoid float
 * precision drift, converted back to ms on read.
 */
export async function recordBatchHotPath(
  redis: RedisLike,
  projectId: string,
  sessionId: string,
  batch: HotPathEvent[],
): Promise<void> {
  await redis.set(redisKeys.presence(projectId, sessionId), Date.now(), {
    ex: PRESENCE_TTL_SECONDS,
  });
  if (batch.length === 0) return;

  await redis.incrby(redisKeys.renderCount(projectId, sessionId), batch.length);

  const countsKey = redisKeys.componentCounts(projectId, sessionId);
  const durationKey = redisKeys.componentDurationMs(projectId, sessionId);
  const avoidableKey = redisKeys.componentAvoidableCounts(projectId, sessionId);
  const avoidableDurationKey = redisKeys.componentAvoidableDurationMs(projectId, sessionId);

  for (const event of batch) {
    const field = String(event.componentId);
    const micros = Math.round(event.durationMs * 1000);
    await redis.hincrby(countsKey, field, 1);
    await redis.hincrby(durationKey, field, micros);
    if (event.isAvoidable) {
      await redis.hincrby(avoidableKey, field, 1);
      await redis.hincrby(avoidableDurationKey, field, micros);
    }
  }

  await redis.expire(countsKey, SESSION_KEY_TTL_SECONDS);
  await redis.expire(durationKey, SESSION_KEY_TTL_SECONDS);
  await redis.expire(avoidableKey, SESSION_KEY_TTL_SECONDS);
  await redis.expire(avoidableDurationKey, SESSION_KEY_TTL_SECONDS);
}

/**
 * `SET key val NX EX 300` (ARCHITECTURE.md §3.4): if the key already exists,
 * Upstash's client returns `null` for a failed NX set — meaning this
 * `batch_id` was already processed (an SDK retry after a network blip),
 * so the caller should treat it as a successful no-op replay, not re-insert.
 */
export async function isDuplicateBatch(
  redis: RedisLike,
  projectId: string,
  batchId: string,
): Promise<boolean> {
  const result = await redis.set(redisKeys.ingestIdempotency(projectId, batchId), 1, {
    nx: true,
    ex: 300,
  });
  return result === null;
}
