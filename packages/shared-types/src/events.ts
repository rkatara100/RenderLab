import type { ContextDiffEntry, PropDiffEntry, RenderReason } from './renderReason.js';

export interface BaseEvent {
  eventId: string;
  sessionId: string;
  appId: string;
  timestamp: number;
  sequence: number;
}

export type RenderPhase = 'mount' | 'update' | 'unmount';

export interface RenderEvent extends BaseEvent {
  type: 'render';
  componentId: string;
  componentName: string;

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

  stateSnapshotRef?: string;
}

export interface LongTaskEvent extends BaseEvent {
  type: 'long-task';
  duration: number;
  attribution: string[];
  correlatedCommitIds?: string[];
}

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

export type TelemetryEvent = RenderEvent | LongTaskEvent | NetworkRequestEvent | SessionMetaEvent;
