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

describe('createRuntime appId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never derives appId from the secret api key', () => {
    const runtime = createRuntime({
      apiKey: 'rl_super_secret_ingest_key_0001',
      environment: 'test',
      longTasks: { enabled: false },
      network: { enabled: false },
    });

    expect(runtime.appId).not.toContain('rl_super_secret');
    expect(runtime.appId.startsWith('rl_')).toBe(false);
    runtime.stopObservers();
  });

  it('uses the configured appId when provided', () => {
    const runtime = createRuntime({
      apiKey: 'key',
      appId: 'checkout-web',
      environment: 'test',
      longTasks: { enabled: false },
      network: { enabled: false },
    });

    expect(runtime.appId).toBe('checkout-web');
    runtime.stopObservers();
  });
});

describe('createRuntime queue lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the batch queue interval on stopObservers so nothing leaks past teardown', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const runtime = createRuntime({
      apiKey: 'key',
      environment: 'test',
      longTasks: { enabled: false },
      network: { enabled: false },
    });
    runtime.stopObservers();

    expect(clearIntervalSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('createRuntime sampling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('discards events at enqueue time when the session is not sampled, before any serialization cost', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.99;

    try {
      const runtime = createRuntime({
        apiKey: 'key',
        environment: 'production',
        sampleRate: 0.1,
        longTasks: { enabled: false },
        network: { enabled: false },
      });

      const stringifySpy = vi.spyOn(JSON, 'stringify');
      runtime.queue.enqueue({
        type: 'render',
        eventId: 'e1',
        sessionId: runtime.sessionId,
        appId: runtime.appId,
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
      });

      expect(stringifySpy).not.toHaveBeenCalled();
      stringifySpy.mockRestore();
      runtime.stopObservers();
    } finally {
      Math.random = originalRandom;
    }
  });
});
