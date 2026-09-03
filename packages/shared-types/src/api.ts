import type { ContextDiffEntry, PropDiffEntry, RenderReason } from './renderReason.js';

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

export interface RenderEventDetail extends RenderTimelineEvent {
  reasonDetail: string | null;
  propsDiff: PropDiffEntry[] | null;
  contextDiff: ContextDiffEntry[] | null;
}

export interface LongTaskSummary {
  id: string;
  ts: string;
  durationMs: number;
  attribution: string[];
  correlatedComponentNames: string[];
}

export interface LongTaskPage {
  tasks: LongTaskSummary[];
  nextCursor: EventPageCursor | null;
}

export interface NetworkRequestSummary {
  id: string;
  ts: string;
  url: string;
  method: string;
  status: number | null;
  durationMs: number;
  initiatorType: string;
  transferSize: number | null;
}

export interface NetworkRequestPage {
  requests: NetworkRequestSummary[];
  nextCursor: EventPageCursor | null;
}
