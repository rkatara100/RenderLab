import { Profiler, useMemo, type JSX, type ReactNode } from 'react';
import type { RenderLabConfig } from '@renderlab/shared-types';
import { createRuntime, getGlobalRuntime, type RenderLabRuntime } from '../capture/runtime.js';
import { useRenderCapture } from '../instrumentation/useRenderCapture.js';
import { ComponentPathContext, RenderLabRuntimeContext } from './context.js';

export interface RenderLabProviderProps {
  config?: RenderLabConfig;
  children: ReactNode;
}

function RootProfilerBoundary({ children }: { children: ReactNode }): JSX.Element {
  // Must live *inside* RenderLabRuntimeContext.Provider (below) so its own
  // useContext read sees the runtime — the outer component establishing a
  // Provider can't consume the value it's providing in the same render.
  const { componentId, componentPath, onRender } = useRenderCapture('__renderlab_root__', {});
  return (
    <ComponentPathContext.Provider value={componentPath}>
      <Profiler id={componentId} onRender={onRender}>
        {children}
      </Profiler>
    </ComponentPathContext.Provider>
  );
}

/**
 * Creates the runtime (or reuses the one `init()` made) and mounts a
 * root-level Profiler boundary — whole-tree aggregate timing even before any
 * component is explicitly wrapped with `withRenderLabProfiler`
 * (ARCHITECTURE.md §4.1). Never throws: no config and no prior `init()` call
 * means no-op passthrough, not a crash.
 */
export function RenderLabProvider({ config, children }: RenderLabProviderProps): JSX.Element {
  const runtime: RenderLabRuntime | null = useMemo(() => {
    if (config) return createRuntime(config);
    return getGlobalRuntime();
    // Runtime is session-scoped by design — created once per mount; config
    // changes mid-session aren't supported.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally created once, see comment above
  }, []);

  if (!runtime) {
    return <>{children}</>;
  }

  return (
    <RenderLabRuntimeContext.Provider value={runtime}>
      <RootProfilerBoundary>{children}</RootProfilerBoundary>
    </RenderLabRuntimeContext.Provider>
  );
}
