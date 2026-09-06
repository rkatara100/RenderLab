import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LongTaskEvent } from '@renderlab/shared-types';
import type { RenderLabRuntime } from '../../src/capture/runtime.js';
import { startLongTaskObserver } from '../../src/observers/longTaskObserver.js';

class TestPerformanceObserver {
  static instances: TestPerformanceObserver[] = [];
  observedTypes: string[] = [];
  disconnected = false;
  constructor(private readonly callback: (list: { getEntries: () => unknown[] }) => void) {
    TestPerformanceObserver.instances.push(this);
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

function makeRuntime(): RenderLabRuntime {
  let sequence = 0;
  return {
    config: {} as RenderLabRuntime['config'],
    queue: { enqueue: vi.fn() },
    sessionId: 's1',
    sessionStartedAt: Date.now(),
    appId: 'a1',
    nextSequence: () => (sequence += 1),
    stopObservers: () => {},
  };
}

describe('startLongTaskObserver', () => {
  beforeEach(() => {
    TestPerformanceObserver.instances = [];
    vi.stubGlobal('PerformanceObserver', TestPerformanceObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is a no-op when PerformanceObserver is unavailable', () => {
    vi.unstubAllGlobals();
    const runtime = makeRuntime();
    const dispose = startLongTaskObserver(runtime);
    expect(() => dispose()).not.toThrow();
    expect(runtime.queue.enqueue).not.toHaveBeenCalled();
  });

  it('observes the longtask entry type', () => {
    const runtime = makeRuntime();
    startLongTaskObserver(runtime);
    expect(TestPerformanceObserver.instances[0]?.observedTypes).toEqual(['longtask']);
  });

  it('enqueues a LongTaskEvent per entry, converting startTime to wall clock', () => {
    const runtime = makeRuntime();
    startLongTaskObserver(runtime);
    const observer = TestPerformanceObserver.instances[0];
    if (!observer) throw new Error('observer not created');

    observer.emit([{ startTime: 100, duration: 75, attribution: [{ name: 'script' }] }]);

    expect(runtime.queue.enqueue).toHaveBeenCalledTimes(1);
    const event = vi.mocked(runtime.queue.enqueue).mock.calls[0]?.[0] as LongTaskEvent;
    expect(event.type).toBe('long-task');
    expect(event.duration).toBe(75);
    expect(event.attribution).toEqual(['script']);
    expect(event.timestamp).toBeCloseTo(performance.timeOrigin + 100);
    expect(event.correlatedCommitIds).toBeUndefined();
  });

  it('defaults attribution entries with no name to "unknown"', () => {
    const runtime = makeRuntime();
    startLongTaskObserver(runtime);
    const observer = TestPerformanceObserver.instances[0];
    if (!observer) throw new Error('observer not created');

    observer.emit([{ startTime: 0, duration: 60, attribution: [{}] }]);

    const event = vi.mocked(runtime.queue.enqueue).mock.calls[0]?.[0] as LongTaskEvent;
    expect(event.attribution).toEqual(['unknown']);
  });

  it('disconnects the underlying observer when disposed', () => {
    const runtime = makeRuntime();
    const dispose = startLongTaskObserver(runtime);
    dispose();
    expect(TestPerformanceObserver.instances[0]?.disconnected).toBe(true);
  });
});
