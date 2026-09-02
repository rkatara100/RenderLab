import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { getActiveRegistry } from './registry.js';

/**
 * Wraps `useState`, additionally reporting whether it changed into the
 * active capture registry (rule 4 of the render-reason heuristic). Also the
 * opt-in source for Phase 7 replay's `stateSnapshotRef`. Must be called
 * *after* `useRenderCapture`/`useRenderLabProfiler` in the same component body.
 */
export function useRenderLabState<S>(
  initialState: S | (() => S),
): [S, Dispatch<SetStateAction<S>>] {
  const [state, setState] = useState(initialState);
  const prevRef = useRef<{ value: S } | null>(null);

  if (prevRef.current !== null) {
    const changed = !Object.is(prevRef.current.value, state);
    const registry = getActiveRegistry();
    if (registry) {
      registry.stateChanged = registry.stateChanged === true || changed;
    }
  }
  prevRef.current = { value: state };
  return [state, setState];
}
