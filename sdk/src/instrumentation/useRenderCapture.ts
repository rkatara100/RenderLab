import { useContext, useMemo, useRef } from 'react';
import type { ProfilerOnRenderCallback } from 'react';
import type {
  ContextDiffEntry,
  PropDiffEntry,
  RenderEvent,
  RenderPhase,
} from '@renderlab/shared-types';
import type { RenderLabRuntime } from '../capture/runtime.js';
import { ComponentPathContext, RenderLabRuntimeContext } from '../provider/context.js';
import { diffProps } from './propsDiff.js';
import { computeRenderReason } from './renderReason.js';
import { activateRegistry, type CaptureRegistry } from './registry.js';

function isIgnored(name: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((p) => (typeof p === 'string' ? p === name : p.test(name)));
}

let instanceCounter = 0;

export interface RenderTiming {
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
}

interface PendingRender {
  runtime: RenderLabRuntime;
  componentId: string;
  componentName: string;
  componentPath: string[];
  phase: RenderPhase;
  propsDiff: PropDiffEntry[];
  contextDiff: ContextDiffEntry[];
  stateChanged: boolean | null;
  isMemoized: boolean;
  renderCountRef: { current: number };
  timing: RenderTiming;
  commitKey: number;
}

/**
 * Resolving the "parent-rerender" rule needs to know every component that
 * rendered in the *same commit* — but React fires nested `Profiler.onRender`
 * (and `useLayoutEffect`) bottom-up, children before parents. By the time a
 * child's callback runs, its parent's hasn't fired yet, so a naive
 * "mark-then-check" would miss real parent-rerenders. Instead, every render
 * in a commit is buffered here and resolved together in a `queueMicrotask`
 * scheduled once per commit — by microtask time, every synchronous
 * `onRender`/layout-effect call for that commit has already run, in any order.
 */
const pendingByCommit = new Map<number, PendingRender[]>();

function finalizeCommit(commitKey: number): void {
  const records = pendingByCommit.get(commitKey);
  pendingByCommit.delete(commitKey);
  if (!records) return;

  const renderedIds = new Set(records.map((r) => r.componentId));

  for (const record of records) {
    const ancestorIds = record.componentPath.slice(0, -1);
    const parentRenderedThisCommit = ancestorIds.some((id) => renderedIds.has(id));

    const { reason, detail } = computeRenderReason({
      phase: record.phase,
      propsDiff: record.propsDiff,
      contextDiff: record.contextDiff,
      stateChanged: record.stateChanged,
      isMemoized: record.isMemoized,
      parentRenderedThisCommit,
    });

    record.renderCountRef.current += 1;

    const event: RenderEvent = {
      type: 'render',
      eventId: crypto.randomUUID(),
      sessionId: record.runtime.sessionId,
      appId: record.runtime.appId,
      timestamp: Date.now(),
      sequence: record.runtime.nextSequence(),
      componentId: record.componentId,
      componentName: record.componentName,
      componentPath: record.componentPath,
      phase: record.phase,
      renderReason: reason,
      reasonDetail: detail,
      propsDiff: record.propsDiff,
      contextDiff: record.contextDiff,
      actualDuration: record.timing.actualDuration,
      baseDuration: record.timing.baseDuration,
      startTime: record.timing.startTime,
      commitTime: record.timing.commitTime,
      isMemoized: record.isMemoized,
      renderCount: record.renderCountRef.current,
    };

    record.runtime.queue.enqueue(event);
  }
}

function schedulePendingRender(record: PendingRender): void {
  let list = pendingByCommit.get(record.commitKey);
  if (!list) {
    list = [];
    pendingByCommit.set(record.commitKey, list);
    queueMicrotask(() => finalizeCommit(record.commitKey));
  }
  list.push(record);
}

export interface RenderCaptureHandle {
  componentId: string;
  componentPath: string[];
  /** Plug directly into `<Profiler onRender={onRender}>` (HOC path). */
  onRender: ProfilerOnRenderCallback;
  /**
   * Call from a `useLayoutEffect` when not wrapping in `<Profiler>` (hook
   * path). Pass `commitKey` (e.g. from `commitEpoch.ts`) since `timing.commitTime`
   * alone can't be trusted to match across sibling components on this path —
   * see commitEpoch.ts for why.
   */
  finalize: (timing: RenderTiming, commitKey?: number) => void;
}

/**
 * The shared engine behind `withRenderLabProfiler` and `useRenderLabProfiler`:
 * assigns a stable componentId/path, diffs props every render, and exposes
 * `finalize` to schedule the RenderEvent once timing is known. Timing is
 * supplied differently by each caller — see ARCHITECTURE.md §8.1 / Phase 1
 * plan for why the HOC gets real Profiler data and the hook variant doesn't.
 */
export function useRenderCapture(
  componentName: string,
  props: Record<string, unknown>,
  options?: { isMemoized?: boolean },
): RenderCaptureHandle {
  const runtime = useContext(RenderLabRuntimeContext);
  const parentPath = useContext(ComponentPathContext);
  const isMemoized = options?.isMemoized ?? false;

  const idRef = useRef<string | null>(null);
  idRef.current ??= `${componentName}#${(instanceCounter++).toString(36)}`;
  const componentId = idRef.current;
  const componentPath = useMemo(() => [...parentPath, componentId], [parentPath, componentId]);

  const prevPropsRef = useRef<Record<string, unknown> | null>(null);
  const renderCountRef = useRef(0);
  const registryRef = useRef<CaptureRegistry>({ contextDiff: [], stateChanged: null });
  registryRef.current = { contextDiff: [], stateChanged: null };
  activateRegistry(registryRef.current);

  const propsDiff = diffProps(prevPropsRef.current, props);
  const phase: RenderPhase = prevPropsRef.current === null ? 'mount' : 'update';
  prevPropsRef.current = props;
  const registry = registryRef.current;

  const finalize = (timing: RenderTiming, commitKey?: number): void => {
    if (!runtime || !runtime.config.enabled) return;
    if (isIgnored(componentName, runtime.config.ignore.componentNames)) return;

    schedulePendingRender({
      runtime,
      componentId,
      componentName,
      componentPath,
      phase,
      propsDiff,
      contextDiff: registry.contextDiff,
      stateChanged: registry.stateChanged,
      isMemoized,
      renderCountRef,
      timing,
      commitKey: commitKey ?? timing.commitTime,
    });
  };

  const onRender: ProfilerOnRenderCallback = (
    _id,
    _reactPhase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    finalize({ actualDuration, baseDuration, startTime, commitTime });
  };

  return { componentId, componentPath, onRender, finalize };
}
