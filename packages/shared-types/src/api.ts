/**
 * Dashboard read-API view models (camelCase JSON) — distinct from the SDK's
 * ingest wire format (events.ts), which is fixed by what the SDK actually
 * sends. These are RenderLab's own read contracts, shared between api/ and
 * dashboard/ so the two can't drift silently.
 */
export interface SessionSummary {
  id: string;
  startedAt: string;
  endedAt: string | null;
  lastSeenAt: string;
  url: string | null;
  totalRenderCount: number;
  totalWastedMs: number;
  isLive: boolean;
}

export interface ComponentSummary {
  componentId: number;
  displayName: string;
  fiberPath: string;
  renderCount: number;
  avoidableCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastRenderAt: string;
}
