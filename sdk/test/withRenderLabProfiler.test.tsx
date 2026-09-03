
import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import type { PropDiffEntry, RenderEvent, TelemetryEvent } from '@renderlab/shared-types';
import { withRenderLabProfiler } from '../src/instrumentation/withRenderLabProfiler.js';
import { RenderLabRuntimeContext } from '../src/provider/context.js';
import { resolveConfig } from '../src/config/defaultConfig.js';
import type { RenderLabRuntime } from '../src/capture/runtime.js';

async function flushCapture(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function makeTestRuntime(): { runtime: RenderLabRuntime; events: RenderEvent[] } {
  const events: RenderEvent[] = [];
  const runtime: RenderLabRuntime = {
    config: resolveConfig({ apiKey: 'test-key' }),
    queue: {
      enqueue: (event: TelemetryEvent) => {
        if (event.type === 'render') events.push(event);
      },
    },
    sessionId: 'sess-1',
    sessionStartedAt: Date.now(),
    appId: 'app-1',
    nextSequence: (() => {
      let n = 0;
      return () => (n += 1);
    })(),
    stopObservers: () => {},
  };
  return { runtime, events };
}

function Child({ value }: { value: number }): React.JSX.Element {
  return <div>{value}</div>;
}
const InstrumentedChild = withRenderLabProfiler(Child, { name: 'Child' });

const stableItems = [1, 2, 3];
function Leaf({ items }: { items: number[] }): React.JSX.Element {
  return <span>{items.length}</span>;
}
const InstrumentedLeaf = withRenderLabProfiler(Leaf, { name: 'Leaf' });

function Parent({ label }: { label: string }): React.JSX.Element {
  return (
    <div>
      {label}
      <InstrumentedLeaf items={stableItems} />
    </div>
  );
}
const InstrumentedParent = withRenderLabProfiler(Parent, { name: 'Parent' });

describe('withRenderLabProfiler — capture + diffing integration', () => {
  it('emits a mount event with renderReason "mount" and renderCount 1', async () => {
    const { runtime, events } = makeTestRuntime();
    render(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <InstrumentedChild value={1} />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ phase: 'mount', renderReason: 'mount', renderCount: 1 });
  });

  it('emits "props-changed" when a prop value actually changes, with the changed key diffed', async () => {
    const { runtime, events } = makeTestRuntime();
    const { rerender } = render(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <InstrumentedChild value={1} />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    rerender(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <InstrumentedChild value={2} />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      phase: 'update',
      renderReason: 'props-changed',
      renderCount: 2,
    });
    expect(events[1]?.propsDiff.find((d: PropDiffEntry) => d.key === 'value')).toMatchObject({
      prevValue: 1,
      nextValue: 2,
      shallowEqual: false,
    });
  });

  it('attributes an unmemoized child\'s re-render to "parent-rerender" when its own props are unchanged', async () => {
    const { runtime, events } = makeTestRuntime();
    const { rerender } = render(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <InstrumentedParent label="a" />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    rerender(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <InstrumentedParent label="b" />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    const parentUpdate = events.find((e) => e.componentName === 'Parent' && e.phase === 'update');
    const leafUpdate = events.find((e) => e.componentName === 'Leaf' && e.phase === 'update');

    expect(parentUpdate?.renderReason).toBe('props-changed');
    expect(leafUpdate?.renderReason).toBe('parent-rerender');
  });
});
