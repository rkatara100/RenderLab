import { useContext, useRef, type Context } from 'react';
import { getActiveRegistry } from './registry.js';

/**
 * Wraps `useContext`, additionally reporting the read into the active
 * capture registry so context changes are attributed precisely (rule 3 of
 * the render-reason heuristic) instead of falling into `'unknown'`. Must be
 * called *after* `useRenderCapture`/`useRenderLabProfiler` in the same
 * component body — see registry.ts for why.
 */
export function useTrackedContext<T>(context: Context<T>, name: string): T {
  const value = useContext(context);
  const prevRef = useRef<{ value: T } | null>(null);

  if (prevRef.current !== null) {
    const registry = getActiveRegistry();
    registry?.contextDiff.push({
      contextName: name,
      referenceEqual: Object.is(prevRef.current.value, value),
    });
  }
  prevRef.current = { value };
  return value;
}
