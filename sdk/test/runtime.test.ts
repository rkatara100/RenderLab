import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RenderEvent } from '@renderlab/shared-types';
import { createRuntime } from '../src/capture/runtime.js';

function makeRenderEvent(overrides: Partial<RenderEvent> = {}): RenderEvent {
  return {
    type: 'render',
    eventId: 'e1',
    sessionId: 's1',
    appId: 'a1',
    timestamp: Date.now(),
    sequence: 1,
    componentId: 'c1',
    componentName: 'Test',
    componentPath: ['Test'],
    phase: 'update',
    renderReason: 'unknown',
    propsDiff: [],
    actualDuration: 1,
    baseDuration: 1,
    startTime: 0,
    commitTime: 1,
    isMemoized: false,
    renderCount: 1,
    ...overrides,
  };
}

describe('createRuntime unload handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('flushes remaining buffered events via sendBeacon on pagehide', () => {
    const beaconSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon: beaconSpy });

    const runtime = createRuntime({
      apiKey: 'key',
      environment: 'test',
      batch: { maxSize: 250, flushIntervalMs: 100_000 },
      longTasks: { enabled: false },
      network: { enabled: false },
    });

    runtime.queue.enqueue(makeRenderEvent());
    window.dispatchEvent(new Event('pagehide'));

    expect(beaconSpy).toHaveBeenCalledTimes(1);
    runtime.stopObservers();
  });

  it('does not flush on pagehide once stopObservers has torn down the listeners', () => {
    const beaconSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon: beaconSpy });

    const runtime = createRuntime({
      apiKey: 'key',
      environment: 'test',
      batch: { maxSize: 250, flushIntervalMs: 100_000 },
      longTasks: { enabled: false },
      network: { enabled: false },
    });
    runtime.stopObservers();

    runtime.queue.enqueue(makeRenderEvent());
    window.dispatchEvent(new Event('pagehide'));

    expect(beaconSpy).not.toHaveBeenCalled();
  });

  it('invokes onError when a batch fails to send', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const onError = vi.fn();

    const runtime = createRuntime({
      apiKey: 'key',
      environment: 'test',
      transport: 'fetch',
      onError,
      batch: { maxSize: 250, flushIntervalMs: 100_000 },
      longTasks: { enabled: false },
      network: { enabled: false },
    });

    runtime.queue.enqueue(makeRenderEvent());
    (runtime.queue as unknown as { flush: () => void }).flush();

    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    runtime.stopObservers();
  });
});
