/** Key naming scheme from ARCHITECTURE.md §3.3 — `rl:{project}:...` for
 * tenant isolation and easy SCAN-based debugging/cleanup. */
export const redisKeys = {
  presence: (projectId: string, sessionId: string): string =>
    `rl:${projectId}:session:${sessionId}:presence`,
  renderCount: (projectId: string, sessionId: string): string =>
    `rl:${projectId}:session:${sessionId}:render_count`,
  componentCounts: (projectId: string, sessionId: string): string =>
    `rl:${projectId}:session:${sessionId}:component_counts`,
  componentAvoidableCounts: (projectId: string, sessionId: string): string =>
    `rl:${projectId}:session:${sessionId}:component_avoidable_counts`,
  componentDurationMs: (projectId: string, sessionId: string): string =>
    `rl:${projectId}:session:${sessionId}:component_duration_ms`,
  componentAvoidableDurationMs: (projectId: string, sessionId: string): string =>
    `rl:${projectId}:session:${sessionId}:component_avoidable_duration_ms`,
  recentEvents: (projectId: string, sessionId: string): string =>
    `rl:${projectId}:session:${sessionId}:recent_events`,
  ingestIdempotency: (projectId: string, batchId: string): string =>
    `rl:${projectId}:ingest:${batchId}`,
};
