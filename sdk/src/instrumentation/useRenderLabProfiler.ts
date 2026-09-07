'use client';

import { useLayoutEffect, useRef } from 'react';
import { currentCommitEpoch } from './commitEpoch.js';
import { useRenderCapture } from './useRenderCapture.js';

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function useRenderLabProfiler(componentName: string, props: Record<string, unknown>): void {
  const { finalize } = useRenderCapture(componentName, props);
  const renderStartRef = useRef(0);
  renderStartRef.current = now();

  useLayoutEffect(() => {
    const commitTime = now();
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
