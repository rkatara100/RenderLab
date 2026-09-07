import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import type { RenderEvent, TelemetryEvent } from '@renderlab/shared-types';
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

function Wrapper({ show }: { show: boolean }): React.JSX.Element {
  return <div>{show ? <InstrumentedChild value={1} /> : null}</div>;
}

describe('unmount emission', () => {
  it('emits a phase: unmount event when the component leaves the tree', async () => {
    const { runtime, events } = makeTestRuntime();
    const { rerender } = render(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <Wrapper show={true} />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();
    expect(events.filter((e) => e.phase === 'mount')).toHaveLength(1);

    rerender(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <Wrapper show={false} />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    const unmountEvents = events.filter((e) => e.phase === 'unmount');
    expect(unmountEvents).toHaveLength(1);
    expect(unmountEvents[0]).toMatchObject({
      componentName: 'Child',
      renderReason: 'unknown',
    });
  });

  it('does not emit an unmount event for a component that only re-renders', async () => {
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

    expect(events.filter((e) => e.phase === 'unmount')).toHaveLength(0);
  });

  it('reports the render count as of the last real render, not zero', async () => {
    const { runtime, events } = makeTestRuntime();
    const { rerender } = render(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <Wrapper show={true} />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    rerender(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <Wrapper show={true} />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    rerender(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <Wrapper show={false} />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    const unmountEvent = events.find((e) => e.phase === 'unmount');
    expect(unmountEvent?.renderCount).toBeGreaterThan(0);
  });

  it('does not emit an unmount event when the component is on the ignore list', async () => {
    const events: RenderEvent[] = [];
    const runtime: RenderLabRuntime = {
      config: resolveConfig({ apiKey: 'test-key', ignore: { componentNames: ['Child'] } }),
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

    const { rerender } = render(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <Wrapper show={true} />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    rerender(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <Wrapper show={false} />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    expect(events).toHaveLength(0);
  });
});
