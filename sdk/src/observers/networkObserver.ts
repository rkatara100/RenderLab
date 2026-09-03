import type { NetworkRequestEvent } from '@renderlab/shared-types';
import type { RenderLabRuntime } from '../capture/runtime.js';
import { toWallClockMs } from './clock.js';

const CAPTURED_INITIATOR_TYPES = new Set(['fetch', 'xmlhttprequest']);

function isIgnored(url: string, endpoint: string, ignoreUrls: Array<string | RegExp>): boolean {
  if (url.startsWith(endpoint)) return true;
  return ignoreUrls.some((pattern) =>
    typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url),
  );
}

export function startNetworkObserver(runtime: RenderLabRuntime): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {};

  const { endpoint, network } = runtime.config;

  let observer: PerformanceObserver;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        if (!CAPTURED_INITIATOR_TYPES.has(entry.initiatorType)) continue;
        if (isIgnored(entry.name, endpoint, network.ignoreUrls)) continue;

        const event: NetworkRequestEvent = {
          type: 'network-request',
          eventId: crypto.randomUUID(),
          sessionId: runtime.sessionId,
          appId: runtime.appId,
          timestamp: toWallClockMs(entry.startTime),
          sequence: runtime.nextSequence(),
          url: entry.name,
          method: 'UNKNOWN',
          duration: entry.duration,
          initiatorType: entry.initiatorType,

          ...(entry.responseStatus ? { status: entry.responseStatus } : {}),
          ...(entry.transferSize ? { transferSize: entry.transferSize } : {}),
        };
        runtime.queue.enqueue(event);
      }
    });
    observer.observe({ entryTypes: ['resource'] });
  } catch {
    return () => {};
  }

  return () => observer.disconnect();
}
