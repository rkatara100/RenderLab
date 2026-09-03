import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkRequestEvent } from '@renderlab/shared-types';
import type { RenderLabRuntime } from '../../src/capture/runtime.js';
import type { ResolvedConfig } from '../../src/config/defaultConfig.js';
import { startNetworkObserver } from '../../src/observers/networkObserver.js';

class FakePerformanceObserver {
  static instances: FakePerformanceObserver[] = [];
  observedTypes: string[] = [];
  disconnected = false;
  constructor(private readonly callback: (list: { getEntries: () => unknown[] }) => void) {
    FakePerformanceObserver.instances.push(this);
  }
  observe(options: { entryTypes: string[] }): void {
    this.observedTypes = options.entryTypes;
  }
  disconnect(): void {
    this.disconnected = true;
  }
  emit(entries: unknown[]): void {
    this.callback({ getEntries: () => entries });
  }
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    apiKey: 'key',
    environment: 'production',
    endpoint: 'https://ingest.renderlab.dev',
    sampleRate: 1,
    batch: { maxSize: 250, flushIntervalMs: 2000, maxQueueBytes: 500_000 },
    ignore: { componentNames: [], propKeys: [] },
    capturePropValues: 'redacted',
    maxPropDepth: 1,
    maxPropStringLength: 200,
    replay: { enabled: false, captureStateHooks: false },
    longTasks: { enabled: true },
    network: { enabled: true, ignoreUrls: [] },
    transport: 'fetch',
    onError: () => {},
    enabled: true,
    ...overrides,
  };
}

function makeRuntime(overrides: Partial<RenderLabRuntime> = {}): RenderLabRuntime {
  let sequence = 0;
  return {
    config: makeConfig(),
    queue: { enqueue: vi.fn() },
    sessionId: 's1',
    sessionStartedAt: Date.now(),
    appId: 'a1',
    nextSequence: () => (sequence += 1),
    stopObservers: () => {},
    ...overrides,
  };
}

describe('startNetworkObserver', () => {
  beforeEach(() => {
    FakePerformanceObserver.instances = [];
    vi.stubGlobal('PerformanceObserver', FakePerformanceObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is a no-op when PerformanceObserver is unavailable', () => {
    vi.unstubAllGlobals();
    const runtime = makeRuntime();
    expect(() => startNetworkObserver(runtime)()).not.toThrow();
    expect(runtime.queue.enqueue).not.toHaveBeenCalled();
  });

  it('observes the resource entry type', () => {
    const runtime = makeRuntime();
    startNetworkObserver(runtime);
    expect(FakePerformanceObserver.instances[0]?.observedTypes).toEqual(['resource']);
  });

  it('captures fetch/xhr entries and ignores other initiator types', () => {
    const runtime = makeRuntime();
    startNetworkObserver(runtime);
    const observer = FakePerformanceObserver.instances[0];
    if (!observer) throw new Error('observer not created');

    observer.emit([
      {
        name: 'https://api.example.com/data',
        initiatorType: 'fetch',
        startTime: 10,
        duration: 50,
        responseStatus: 200,
        transferSize: 1200,
      },
      { name: 'https://cdn.example.com/logo.png', initiatorType: 'img', startTime: 10, duration: 5 },
    ]);

    expect(runtime.queue.enqueue).toHaveBeenCalledTimes(1);
    const event = vi.mocked(runtime.queue.enqueue).mock.calls[0]?.[0] as NetworkRequestEvent;
    expect(event.url).toBe('https://api.example.com/data');
    expect(event.status).toBe(200);
    expect(event.transferSize).toBe(1200);
    expect(event.method).toBe('UNKNOWN');
    expect(event.timestamp).toBeCloseTo(performance.timeOrigin + 10);
  });

  it('ignores requests to the SDK endpoint', () => {
    const runtime = makeRuntime({ config: makeConfig({ endpoint: 'https://ingest.example.com' }) });
    startNetworkObserver(runtime);
    const observer = FakePerformanceObserver.instances[0];
    if (!observer) throw new Error('observer not created');

    observer.emit([
      {
        name: 'https://ingest.example.com/api/ingest/events',
        initiatorType: 'fetch',
        startTime: 0,
        duration: 5,
      },
    ]);

    expect(runtime.queue.enqueue).not.toHaveBeenCalled();
  });

  it('ignores requests matching a configured ignoreUrls pattern', () => {
    const runtime = makeRuntime({ config: makeConfig({ network: { enabled: true, ignoreUrls: [/analytics/] } }) });
    startNetworkObserver(runtime);
    const observer = FakePerformanceObserver.instances[0];
    if (!observer) throw new Error('observer not created');

    observer.emit([
      { name: 'https://api.example.com/analytics/beacon', initiatorType: 'fetch', startTime: 0, duration: 5 },
    ]);

    expect(runtime.queue.enqueue).not.toHaveBeenCalled();
  });

  it('omits status/transferSize when reported as 0 (unavailable)', () => {
    const runtime = makeRuntime();
    startNetworkObserver(runtime);
    const observer = FakePerformanceObserver.instances[0];
    if (!observer) throw new Error('observer not created');

    observer.emit([
      {
        name: 'https://api.example.com/data',
        initiatorType: 'xmlhttprequest',
        startTime: 0,
        duration: 5,
        responseStatus: 0,
        transferSize: 0,
      },
    ]);

    const event = vi.mocked(runtime.queue.enqueue).mock.calls[0]?.[0] as NetworkRequestEvent;
    expect(event.status).toBeUndefined();
    expect(event.transferSize).toBeUndefined();
  });

  it('disconnects the underlying observer when disposed', () => {
    const runtime = makeRuntime();
    const dispose = startNetworkObserver(runtime);
    dispose();
    expect(FakePerformanceObserver.instances[0]?.disconnected).toBe(true);
  });
});
