import type { PropDiffEntry, TelemetryEvent } from '@renderlab/shared-types';
import type { ResolvedConfig } from '../config/defaultConfig.js';

function truncate(value: unknown, maxLength: number, depth: number, maxDepth: number): unknown {
  if (depth > maxDepth) return '[depth limit]';
  if (typeof value === 'string') {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  }
  if (typeof value === 'function') return '[function]';
  if (Array.isArray(value)) return value.map((v) => truncate(v, maxLength, depth + 1, maxDepth));
  if (value !== null && typeof value === 'object') {
    if ('$$typeof' in value) return '[react element]';
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = truncate(v, maxLength, depth + 1, maxDepth);
    return out;
  }
  return value;
}

function redactPropsDiff(diffs: PropDiffEntry[], config: ResolvedConfig): PropDiffEntry[] {
  const kept = diffs.filter((d) => !config.ignore.propKeys.includes(d.key));

  if (config.capturePropValues === 'off') {
    return kept.map((d) => ({ ...d, prevValue: undefined, nextValue: undefined }));
  }
  if (config.capturePropValues === 'full') {
    return kept;
  }
  return kept.map((d) => ({
    ...d,
    prevValue: truncate(d.prevValue, config.maxPropStringLength, 0, config.maxPropDepth),
    nextValue: truncate(d.nextValue, config.maxPropStringLength, 0, config.maxPropDepth),
  }));
}

/**
 * Applies `capturePropValues`/`maxPropDepth`/`maxPropStringLength`/`ignore.propKeys`
 * just before a batch is sent — kept out of the hot capture path (diffing
 * still sees full values in-memory for correctness) so redaction is a pure
 * function of config, easy to unit test in isolation.
 */
export function serializeEvent(event: TelemetryEvent, config: ResolvedConfig): TelemetryEvent {
  if (event.type !== 'render') return event;
  return { ...event, propsDiff: redactPropsDiff(event.propsDiff, config) };
}
