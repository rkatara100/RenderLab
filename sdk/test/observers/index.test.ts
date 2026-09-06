import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderLabRuntime } from '../../src/capture/runtime.js';
import type { ResolvedConfig } from '../../src/config/defaultConfig.js';
import { startObservers } from '../../src/observers/index.js';

class TestPerformanceObserver {
  static instances: TestPerformanceObserver[] = [];
  observedTypes: string[] = [];
  disconnected = false;
  constructor(_callback: (list: { getEntries: () => unknown[] }) => void) {
    TestPerformanceObserver.instances.push(this);
  }
  observe(options: { entryTypes: string[] }): void {
    this.observedTypes = options.entryTypes;
  }
  disconnect(): void {
    this.disconnected = true;
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

function makeRuntime(config: ResolvedConfig): RenderLabRuntime {
  let sequence = 0;
  return {
    config,
    queue: { enqueue: vi.fn() },
    sessionId: 's1',
    sessionStartedAt: Date.now(),
    appId: 'a1',
    nextSequence: () => (sequence += 1),
    stopObservers: () => {},
  };
}

describe('startObservers', () => {
  beforeEach(() => {
    TestPerformanceObserver.instances = [];
    vi.stubGlobal('PerformanceObserver', TestPerformanceObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts both observers by default', () => {
    startObservers(makeRuntime(makeConfig()));
    expect(TestPerformanceObserver.instances).toHaveLength(2);
    const observedTypes = TestPerformanceObserver.instances.map((o) => o.observedTypes[0]);
    expect(observedTypes).toEqual(expect.arrayContaining(['longtask', 'resource']));
  });

  it('skips the long-task observer when longTasks.enabled is false', () => {
    startObservers(makeRuntime(makeConfig({ longTasks: { enabled: false } })));
    expect(TestPerformanceObserver.instances).toHaveLength(1);
    expect(TestPerformanceObserver.instances[0]?.observedTypes).toEqual(['resource']);
  });

  it('skips the network observer when network.enabled is false', () => {
    startObservers(makeRuntime(makeConfig({ network: { enabled: false, ignoreUrls: [] } })));
    expect(TestPerformanceObserver.instances).toHaveLength(1);
    expect(TestPerformanceObserver.instances[0]?.observedTypes).toEqual(['longtask']);
  });

  it('the returned disposer disconnects every started observer', () => {
    const dispose = startObservers(makeRuntime(makeConfig()));
    dispose();
    expect(TestPerformanceObserver.instances.every((o) => o.disconnected)).toBe(true);
  });
});
