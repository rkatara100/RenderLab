import type { LongTaskEvent } from '@renderlab/shared-types';
import type { RenderLabRuntime } from '../capture/runtime.js';
import { toWallClockMs } from './clock.js';

interface LongTaskPerformanceEntry extends PerformanceEntry {
  attribution?: Array<{ name?: string }>;
}

export function startLongTaskObserver(runtime: RenderLabRuntime): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {};

  let observer: PerformanceObserver;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LongTaskPerformanceEntry[]) {
        const event: LongTaskEvent = {
          type: 'long-task',
          eventId: crypto.randomUUID(),
          sessionId: runtime.sessionId,
          appId: runtime.appId,
          timestamp: toWallClockMs(entry.startTime),
          sequence: runtime.nextSequence(),
          duration: entry.duration,
          attribution: (entry.attribution ?? []).map((a) => a.name ?? 'unknown'),
        };
        runtime.queue.enqueue(event);
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    return () => {};
  }

  return () => observer.disconnect();
}
