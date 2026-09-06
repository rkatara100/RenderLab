import { redisKeys } from './keys.js';

export interface RedisLike {
  set: (key: string, value: string | number, opts?: { ex?: number; nx?: true }) => Promise<unknown>;
  incrby: (key: string, amount: number) => Promise<number>;
  hincrby: (key: string, field: string, amount: number) => Promise<number>;
  hset: (key: string, kv: Record<string, string | number>) => Promise<unknown>;
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
  const maxDurationKey = redisKeys.componentMaxDurationMs(projectId, sessionId);

  const batchMaxByComponent = new Map<string, number>();

  for (const event of batch) {
    const field = String(event.componentId);
    const micros = Math.round(event.durationMs * 1000);
    await redis.hincrby(countsKey, field, 1);
    await redis.hincrby(durationKey, field, micros);
    if (event.isAvoidable) {
      await redis.hincrby(avoidableKey, field, 1);
      await redis.hincrby(avoidableDurationKey, field, micros);
    }
    if (micros > (batchMaxByComponent.get(field) ?? 0)) {
      batchMaxByComponent.set(field, micros);
    }
  }

  const existingMax = await redis.hgetall(maxDurationKey);
  for (const [field, batchMax] of batchMaxByComponent) {
    if (batchMax > Number(existingMax?.[field] ?? 0)) {
      await redis.hset(maxDurationKey, { [field]: batchMax });
    }
  }

  await redis.expire(countsKey, SESSION_KEY_TTL_SECONDS);
  await redis.expire(durationKey, SESSION_KEY_TTL_SECONDS);
  await redis.expire(avoidableKey, SESSION_KEY_TTL_SECONDS);
  await redis.expire(avoidableDurationKey, SESSION_KEY_TTL_SECONDS);
  await redis.expire(maxDurationKey, SESSION_KEY_TTL_SECONDS);
}

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

export async function clearDuplicateMarker(
  redis: RedisLike,
  projectId: string,
  batchId: string,
): Promise<void> {
  await redis.del(redisKeys.ingestIdempotency(projectId, batchId));
}
