import type {
  ContextDiffEntry,
  PropDiffEntry,
  RenderPhase,
  RenderReason,
} from '@renderlab/shared-types';
import { hasChangedProps } from './propsDiff.js';

export interface RenderReasonInput {
  phase: RenderPhase;
  propsDiff: PropDiffEntry[];
  contextDiff: ContextDiffEntry[];

  stateChanged: boolean | null;
  isMemoized: boolean;
  parentRenderedThisCommit: boolean;
}

export interface RenderReasonResult {
  reason: RenderReason;
  detail: string;
}

export function computeRenderReason(input: RenderReasonInput): RenderReasonResult {
  const { phase, propsDiff, contextDiff, stateChanged, isMemoized, parentRenderedThisCommit } =
    input;

  if (phase === 'mount') {
    return { reason: 'mount', detail: 'initial mount' };
  }

  if (hasChangedProps(propsDiff)) {
    const changed = propsDiff.find((d) => !d.shallowEqual);
    return { reason: 'props-changed', detail: `props.${changed?.key ?? '?'} changed` };
  }

  const changedContext = contextDiff.find((c) => !c.referenceEqual);
  if (changedContext) {
    return { reason: 'context-changed', detail: `context "${changedContext.contextName}" changed` };
  }

  if (stateChanged === true) {
    return { reason: 'state-changed', detail: 'local state changed' };
  }

  if (parentRenderedThisCommit && !isMemoized) {
    return {
      reason: 'parent-rerender',
      detail: 'not memoized; re-rendered because an ancestor did',
    };
  }

  return {
    reason: 'unknown',
    detail:
      'no tracked signal changed — possibly an external store update; wrap with useRenderLabState or useTrackedContext for precise attribution',
  };
}
