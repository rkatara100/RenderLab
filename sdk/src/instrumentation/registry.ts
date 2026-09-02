import type { ContextDiffEntry } from '@renderlab/shared-types';

/**
 * Cross-hook wiring for the current render: `useTrackedContext` and
 * `useRenderLabState` can't pass data to `useRenderCapture` via props or
 * context (a Provider is a JSX element, not available mid-render), so they
 * write into this module-level "active registry" instead. Safe because
 * React executes one function component's body fully and synchronously
 * before any other component's hooks run — there's no interleaving.
 *
 * Call order requirement (documented on the public hooks): `useTrackedContext`
 * / `useRenderLabState` must be called *after* `useRenderCapture` /
 * `useRenderLabProfiler` in the same component body.
 */
export interface CaptureRegistry {
  contextDiff: ContextDiffEntry[];
  stateChanged: boolean | null;
}

let active: CaptureRegistry | null = null;

export function activateRegistry(registry: CaptureRegistry): void {
  active = registry;
}

export function getActiveRegistry(): CaptureRegistry | null {
  return active;
}
