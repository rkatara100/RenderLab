import type { Pool } from 'pg';
import { updateSessionTotals, upsertSessionComponentRollup } from '../db/repository.js';
import { redisKeys } from './keys.js';
import type { RedisLike } from './hotPath.js';

export async function flushSessionRollup(
  pool: Pool,
  redis: RedisLike,
  projectId: string,
  sessionId: string,
): Promise<void> {
  const countsKey = redisKeys.componentCounts(projectId, sessionId);
  const durationKey = redisKeys.componentDurationMs(projectId, sessionId);
  const avoidableKey = redisKeys.componentAvoidableCounts(projectId, sessionId);
  const avoidableDurationKey = redisKeys.componentAvoidableDurationMs(projectId, sessionId);
  const maxDurationKey = redisKeys.componentMaxDurationMs(projectId, sessionId);

  const counts = await redis.hgetall(countsKey);
  if (!counts || Object.keys(counts).length === 0) return;

  const durations = await redis.hgetall(durationKey);
  const avoidables = await redis.hgetall(avoidableKey);
  const avoidableDurations = await redis.hgetall(avoidableDurationKey);
  const maxDurations = await redis.hgetall(maxDurationKey);

  await redis.del(countsKey, durationKey, avoidableKey, avoidableDurationKey, maxDurationKey);

  let totalRenders = 0;
  let totalWastedMs = 0;
  const now = new Date().toISOString();

  for (const [componentIdStr, countStr] of Object.entries(counts)) {
    const renderCount = Number(countStr);
    const totalDurationMs = Number(durations?.[componentIdStr] ?? 0) / 1000;
    const avoidableCount = Number(avoidables?.[componentIdStr] ?? 0);

    const avoidableDurationMs = Number(avoidableDurations?.[componentIdStr] ?? 0) / 1000;
    const maxDurationMs = Number(maxDurations?.[componentIdStr] ?? 0) / 1000;

    await upsertSessionComponentRollup(pool, {
      sessionId,
      componentId: Number(componentIdStr),
      renderCount,
      avoidableCount,
      totalDurationMs,
      maxDurationMs,
      lastRenderAt: now,
    });

    totalRenders += renderCount;
    totalWastedMs += avoidableDurationMs;
  }

  await updateSessionTotals(pool, sessionId, totalRenders, totalWastedMs);
}
