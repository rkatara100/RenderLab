'use client';

import { Profiler, useEffect, useState, type JSX, type ReactNode } from 'react';
import type { RenderLabConfig } from '@renderlab/shared-types';
import { createRuntime, getGlobalRuntime, type RenderLabRuntime } from '../capture/runtime.js';
import { useRenderCapture } from '../instrumentation/useRenderCapture.js';
import { ComponentPathContext, RenderLabRuntimeContext } from './context.js';

export interface RenderLabProviderProps {
  config?: RenderLabConfig;
  children: ReactNode;
}

function RootProfilerBoundary({ children }: { children: ReactNode }): JSX.Element {
  const { componentId, componentPath, onRender } = useRenderCapture('__renderlab_root__', {});
  return (
    <ComponentPathContext.Provider value={componentPath}>
      <Profiler id={componentId} onRender={onRender}>
        {children}
      </Profiler>
    </ComponentPathContext.Provider>
  );
}

export function RenderLabProvider({ config, children }: RenderLabProviderProps): JSX.Element {
  const [runtime] = useState<RenderLabRuntime | null>(() => {
    if (config) return createRuntime(config);
    return getGlobalRuntime();
  });

  useEffect(() => {
    if (!runtime) {
      console.warn(
        '[RenderLab] RenderLabProvider rendered without a runtime. ' +
          'Call init({ apiKey }) before this provider mounts, or pass a config prop directly. ' +
          'No telemetry will be captured until this is fixed.',
      );
    }
  }, [runtime]);

  if (!runtime) {
    return <>{children}</>;
  }

  return (
    <RenderLabRuntimeContext.Provider value={runtime}>
      <RootProfilerBoundary>{children}</RootProfilerBoundary>
    </RenderLabRuntimeContext.Provider>
  );
}
