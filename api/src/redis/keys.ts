
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
  componentMaxDurationMs: (projectId: string, sessionId: string): string =>
    `rl:${projectId}:session:${sessionId}:component_max_duration_ms`,
  recentEvents: (projectId: string, sessionId: string): string =>
    `rl:${projectId}:session:${sessionId}:recent_events`,
  ingestIdempotency: (projectId: string, batchId: string): string =>
    `rl:${projectId}:ingest:${batchId}`,
  rateLimitIngest: (projectId: string): string => `rl:${projectId}:ratelimit:ingest`,
  rateLimitSignup: (ip: string): string => `rl:signup:ratelimit:${ip}`,
  rateLimitReplay: (projectId: string): string => `rl:${projectId}:ratelimit:replay`,
  rateLimitRead: (projectId: string): string => `rl:${projectId}:ratelimit:read`,
};
