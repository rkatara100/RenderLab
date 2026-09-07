import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { RenderEvent, RenderLabSDKError, TelemetryEvent } from '@renderlab/shared-types';
import { withRenderLabProfiler } from '../src/instrumentation/withRenderLabProfiler.js';
import { RenderLabRuntimeContext } from '../src/provider/context.js';
import { resolveConfig } from '../src/config/defaultConfig.js';
import type { RenderLabRuntime } from '../src/capture/runtime.js';

async function flushCapture(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function Child({ value }: { value: number }): React.JSX.Element {
  return <div>{value}</div>;
}
const InstrumentedFirst = withRenderLabProfiler(Child, { name: 'First' });
const InstrumentedSecond = withRenderLabProfiler(Child, { name: 'Second' });

describe('useRenderCapture resilience', () => {
  it('reports one bad record via onError without dropping sibling records in the same commit', async () => {
    const onError = vi.fn<(error: RenderLabSDKError) => void>();
    const events: RenderEvent[] = [];

    const runtime: RenderLabRuntime = {
      config: resolveConfig({ apiKey: 'test-key', onError }),
      queue: {
        enqueue: (event: TelemetryEvent) => {
          if (event.type !== 'render') return;
          if (event.componentName === 'First') {
            throw new Error('simulated sink failure for First');
          }
          events.push(event);
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

    render(
      <RenderLabRuntimeContext.Provider value={runtime}>
        <InstrumentedFirst value={1} />
        <InstrumentedSecond value={1} />
      </RenderLabRuntimeContext.Provider>,
    );
    await flushCapture();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].message).toMatch(/failed to finalize/);
    expect(events).toHaveLength(1);
    expect(events[0]?.componentName).toBe('Second');
  });
});
