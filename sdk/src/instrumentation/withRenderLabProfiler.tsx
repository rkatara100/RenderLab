import { Profiler, type ComponentType, type JSX } from 'react';
import { ComponentPathContext } from '../provider/context.js';
import { useRenderCapture } from './useRenderCapture.js';

const REACT_MEMO_TYPE = Symbol.for('react.memo');

function isMemoComponent(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    value.$$typeof === REACT_MEMO_TYPE
  );
}

/**
 * Wraps `Component` in a real `<Profiler>` boundary — this is the accurate
 * timing path (real `actualDuration`/`baseDuration` from React itself). If
 * `Component` is already `React.memo`-wrapped, a bailed-out render emits no
 * event at all (Profiler never calls `onRender` for a fully-skipped subtree)
 * — this is intended, documented behavior (ARCHITECTURE.md §5), not a bug.
 */
export function withRenderLabProfiler<P extends object>(
  Component: ComponentType<P>,
  options?: { name?: string },
): ComponentType<P> {
  const name = options?.name ?? Component.displayName ?? Component.name ?? 'Anonymous';
  const isMemoized = isMemoComponent(Component);

  function Instrumented(props: P): JSX.Element {
    const { componentId, componentPath, onRender } = useRenderCapture(
      name,
      props as Record<string, unknown>,
      { isMemoized },
    );
    return (
      <ComponentPathContext.Provider value={componentPath}>
        <Profiler id={componentId} onRender={onRender}>
          <Component {...props} />
        </Profiler>
      </ComponentPathContext.Provider>
    );
  }

  Instrumented.displayName = `RenderLab(${name})`;
  return Instrumented;
}
