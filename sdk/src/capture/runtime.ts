import type { RenderLabConfig, TelemetryEvent } from '@renderlab/shared-types';
import { resolveConfig, type ResolvedConfig } from '../config/defaultConfig.js';
import { BatchQueue, type EventSink } from './queue.js';
import { serializeEvent } from './serialize.js';
import { sendBatch } from './transport.js';

export interface RenderLabRuntime {
  config: ResolvedConfig;
  queue: EventSink;
  sessionId: string;
  sessionStartedAt: number;
  appId: string;
  nextSequence: () => number;
}

/**
 * Wires config -> batching queue -> serialization -> transport, and decides
 * once per session whether this session is sampled (ARCHITECTURE.md §8.7:
 * full in dev, partial in prod by default — a cost/volume control, not a
 * detection gap).
 */
export function createRuntime(config: RenderLabConfig): RenderLabRuntime {
  const resolved = resolveConfig(config);
  const sampled = Math.random() < resolved.sampleRate;
  const sessionId = crypto.randomUUID();
  const sessionStartedAt = Date.now();
  let sequence = 0;

  const queue = new BatchQueue({
    maxSize: resolved.batch.maxSize,
    flushIntervalMs: resolved.batch.flushIntervalMs,
    maxQueueBytes: resolved.batch.maxQueueBytes,
    onFlush: (events: TelemetryEvent[]) => {
      if (!sampled) return;
      try {
        const serialized = events.map((event) => serializeEvent(event, resolved));
        sendBatch(
          serialized,
          { sessionId, startedAt: sessionStartedAt },
          { endpoint: resolved.endpoint, apiKey: resolved.apiKey, mode: resolved.transport },
        );
      } catch (cause) {
        resolved.onError({ message: 'RenderLab: failed to flush batch', cause });
      }
    },
  });

  return {
    config: resolved,
    queue,
    sessionId,
    sessionStartedAt,
    // The server resolves the real tenant from the API key (ARCHITECTURE.md
    // §3.4) — this is a client-side echo for correlation only, never used
    // for authorization.
    appId: resolved.apiKey.slice(0, 8),
    nextSequence: () => (sequence += 1),
  };
}

let globalRuntime: RenderLabRuntime | null = null;

export function setGlobalRuntime(runtime: RenderLabRuntime): void {
  globalRuntime = runtime;
}

export function getGlobalRuntime(): RenderLabRuntime | null {
  return globalRuntime;
}

/** Test-only reset — avoids cross-test leakage of the module-level singleton. */
export function resetGlobalRuntime(): void {
  globalRuntime = null;
}
