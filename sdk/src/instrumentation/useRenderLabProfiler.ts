import { useLayoutEffect, useRef } from 'react';
import { currentCommitEpoch } from './commitEpoch.js';
import { useRenderCapture } from './useRenderCapture.js';

/**
 * In-body hook variant for components that can't easily be wrapped in
 * `withRenderLabProfiler`. Cannot use `React.Profiler` — a hook can't wrap
 * its own component's return value — so timing is approximated via
 * `performance.now()` at render-start vs. commit (`useLayoutEffect`, which
 * fires after commit, before paint). This is real, working, but less precise
 * than the HOC's Profiler data: no `baseDuration`, and it includes a small
 * amount of scheduler overhead. Explicit, documented trade-off — not a stub.
 */
export function useRenderLabProfiler(componentName: string, props: Record<string, unknown>): void {
  const { finalize } = useRenderCapture(componentName, props);
  const renderStartRef = useRef(0);
  renderStartRef.current = performance.now();

  useLayoutEffect(() => {
    const commitTime = performance.now();
    const duration = Math.max(0, commitTime - renderStartRef.current);
    finalize(
      {
        actualDuration: duration,
        baseDuration: duration,
        startTime: renderStartRef.current,
        commitTime,
      },
      currentCommitEpoch(),
    );
  });
}
