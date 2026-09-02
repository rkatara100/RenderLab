import type { RenderReason } from './renderReason.js';

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

/** One raw render event as shown in the Phase 4 timeline / Phase 5
 * why-did-it-render panel. `renderReason` is decoded server-side from the
 * stored SMALLINT (ARCHITECTURE.md §3.1) back to the SDK's string union, so
 * the dashboard never needs to know about the numeric encoding. */
export interface RenderTimelineEvent {
  id: string;
  ts: string;
  durationMs: number;
  renderReason: RenderReason;
  isAvoidable: boolean;
  componentId: number;
  componentName: string;
}

export interface EventPageCursor {
  ts: string;
  id: string;
}

export interface RenderTimelinePage {
  events: RenderTimelineEvent[];
  nextCursor: EventPageCursor | null;
}
