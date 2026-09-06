import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderEvent } from '@renderlab/shared-types';
import { BatchQueue } from '../src/capture/queue.js';

function makeEvent(overrides: Partial<RenderEvent> = {}): RenderEvent {
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

describe('BatchQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flushes once the buffer reaches maxSize', () => {
    const onFlush = vi.fn();
    const queue = new BatchQueue({
      maxSize: 3,
      flushIntervalMs: 100_000,
      maxQueueBytes: 1_000_000,
      onFlush,
    });

    queue.enqueue(makeEvent());
    queue.enqueue(makeEvent());
    expect(onFlush).not.toHaveBeenCalled();
    queue.enqueue(makeEvent());

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0]?.[0]).toHaveLength(3);
    expect(queue.size).toBe(0);
  });

  it('flushes on the interval even below maxSize', () => {
    const onFlush = vi.fn();
    const queue = new BatchQueue({
      maxSize: 250,
      flushIntervalMs: 2000,
      maxQueueBytes: 1_000_000,
      onFlush,
    });

    queue.enqueue(makeEvent());
    vi.advanceTimersByTime(2000);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0]?.[0]).toHaveLength(1);
    queue.destroy();
  });

  it('does not flush an empty buffer on interval', () => {
    const onFlush = vi.fn();
    const queue = new BatchQueue({
      maxSize: 250,
      flushIntervalMs: 2000,
      maxQueueBytes: 1_000_000,
      onFlush,
    });

    vi.advanceTimersByTime(2000);
    expect(onFlush).not.toHaveBeenCalled();
    queue.destroy();
  });

  it('drops the oldest events once maxQueueBytes is exceeded', () => {
    const onFlush = vi.fn();

    const oneEventBytes = JSON.stringify(makeEvent()).length;
    const queue = new BatchQueue({
      maxSize: 100,
      flushIntervalMs: 100_000,
      maxQueueBytes: oneEventBytes + 10,
      onFlush,
    });

    queue.enqueue(makeEvent({ eventId: 'first' }));
    queue.enqueue(makeEvent({ eventId: 'second' }));
    queue.enqueue(makeEvent({ eventId: 'third' }));
    queue.flush();

    const flushed = onFlush.mock.calls[0]?.[0] as RenderEvent[];
    expect(flushed.map((e) => e.eventId)).not.toContain('first');
    expect(flushed.map((e) => e.eventId)).toContain('third');
  });

  it('drain() returns buffered events without invoking onFlush', () => {
    const onFlush = vi.fn();
    const queue = new BatchQueue({
      maxSize: 250,
      flushIntervalMs: 100_000,
      maxQueueBytes: 1_000_000,
      onFlush,
    });

    queue.enqueue(makeEvent({ eventId: 'a' }));
    queue.enqueue(makeEvent({ eventId: 'b' }));
    const drained = queue.drain();

    expect(drained.map((e) => e.eventId)).toEqual(['a', 'b']);
    expect(onFlush).not.toHaveBeenCalled();
    expect(queue.size).toBe(0);
    queue.destroy();
  });

  it('destroy() flushes any remaining buffered events and stops the timer', () => {
    const onFlush = vi.fn();
    const queue = new BatchQueue({
      maxSize: 250,
      flushIntervalMs: 2000,
      maxQueueBytes: 1_000_000,
      onFlush,
    });

    queue.enqueue(makeEvent());
    queue.destroy();
    expect(onFlush).toHaveBeenCalledTimes(1);

    onFlush.mockClear();
    vi.advanceTimersByTime(10_000);
    expect(onFlush).not.toHaveBeenCalled();
  });
});
