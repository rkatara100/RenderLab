import type { Pool } from 'pg';
import { updateSessionTotals, upsertSessionComponentRollup } from '../db/repository.js';
import { redisKeys } from './keys.js';
import type { RedisLike } from './hotPath.js';

/**
 * Periodic Redis -> Postgres flush (ARCHITECTURE.md §3.3), run every ~15-30s
 * per active session (driven by whatever discovers "active sessions" —
 * ingest.ts calls this inline per-batch in Phase 2 rather than a separate
 * scheduled worker process; see phase summary for why). Reads the hot
 * hashes, upserts the increments into `session_component_rollups`, then
 * clears them.
 *
 * Read-then-delete isn't atomic on the Upstash REST client (no true
 * MULTI/transaction used here) — a render arriving in that narrow window is
 * lost from the *rollup* only. Postgres's raw `render_events` is always
 * written synchronously and is unaffected, so nothing is lost from the
 * source of truth, and the rollup can be recomputed from raw events if ever
 * needed. Documented, acceptable trade-off, not a silent gap.
 */
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

  const counts = await redis.hgetall(countsKey);
  if (!counts || Object.keys(counts).length === 0) return;

  const durations = await redis.hgetall(durationKey);
  const avoidables = await redis.hgetall(avoidableKey);
  const avoidableDurations = await redis.hgetall(avoidableDurationKey);

  await redis.del(countsKey, durationKey, avoidableKey, avoidableDurationKey);

  let totalRenders = 0;
  let totalWastedMs = 0;
  const now = new Date().toISOString();

  for (const [componentIdStr, countStr] of Object.entries(counts)) {
    const renderCount = Number(countStr);
    const totalDurationMs = Number(durations?.[componentIdStr] ?? 0) / 1000;
    const avoidableCount = Number(avoidables?.[componentIdStr] ?? 0);
    // total_wasted_ms is specifically time spent on avoidable renders
    // (ARCHITECTURE.md §3.1) — not all render time, so this sums the
    // avoidable-duration hash, not the all-renders duration hash above.
    const avoidableDurationMs = Number(avoidableDurations?.[componentIdStr] ?? 0) / 1000;

    await upsertSessionComponentRollup(pool, {
      sessionId,
      componentId: Number(componentIdStr),
      renderCount,
      avoidableCount,
      totalDurationMs,
      lastRenderAt: now,
    });

    totalRenders += renderCount;
    totalWastedMs += avoidableDurationMs;
  }

  await updateSessionTotals(pool, sessionId, totalRenders, totalWastedMs);
}
