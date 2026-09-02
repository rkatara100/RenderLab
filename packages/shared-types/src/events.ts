import type { ContextDiffEntry, PropDiffEntry, RenderReason } from './renderReason.js';

/**
 * Fields common to every telemetry event the SDK emits. `sequence` is a
 * monotonic per-session counter — it is the total-ordering and gap-detection
 * key on ingest, independent of (and more reliable than) network arrival
 * order across batches.
 */
export interface BaseEvent {
  eventId: string;
  sessionId: string;
  appId: string;
  timestamp: number;
  sequence: number;
}

export type RenderPhase = 'mount' | 'update' | 'unmount';

/**
 * A single captured render/re-render. See ARCHITECTURE.md section 4.3 and 6
 * for why each field exists (props diff feeds the render-reason heuristic;
 * componentPath + commitTime + unmount phase are what make Phase 7's
 * timeline-scrub replay possible without any additional capture).
 */
export interface RenderEvent extends BaseEvent {
  type: 'render';
  componentId: string;
  componentName: string;
  /** Ancestor componentIds, root-first. Substitutes for fiber parent pointers
   * (not exposed by the public Profiler API) — see ARCHITECTURE.md §8.8. */
  componentPath: string[];
  phase: RenderPhase;
  renderReason: RenderReason;
  reasonDetail?: string;
  propsDiff: PropDiffEntry[];
  contextDiff?: ContextDiffEntry[];
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
  isMemoized: boolean;
  renderCount: number;
  /** Only populated when `config.replay.enabled` and the component uses
   * `useRenderLabState`. A pointer into an out-of-band snapshot store, not
   * inline data — kept out of the default payload (ARCHITECTURE.md §6). */
  stateSnapshotRef?: string;
}

/** Phase 6. Defined now so the shared-types contract is additive, not
 * breaking, once long-task capture ships. */
export interface LongTaskEvent extends BaseEvent {
  type: 'long-task';
  duration: number;
  attribution: string[];
  correlatedCommitIds?: string[];
}

/** Phase 6. */
export interface NetworkRequestEvent extends BaseEvent {
  type: 'network-request';
  url: string;
  method: string;
  status?: number;
  duration: number;
  initiatorType: string;
  transferSize?: number;
}

export interface SessionMetaEvent extends BaseEvent {
  type: 'session-meta';
  sdkVersion: string;
  appVersion?: string;
  viewport: { width: number; height: number };
  userAgent: string;
}

/** Discriminated union on `type` — the ingestion API and dashboard both
 * switch on this field, and new event kinds can be added without breaking
 * existing consumers. */
export type TelemetryEvent = RenderEvent | LongTaskEvent | NetworkRequestEvent | SessionMetaEvent;
