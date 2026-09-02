import type { PropDiffEntry, PropValueType } from '@renderlab/shared-types';

function classifyValue(value: unknown): PropValueType {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function'))
    return 'primitive';
  if (typeof value === 'function') return 'function';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && '$$typeof' in value) return 'element';
  return 'object';
}

function shallowEqualValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const aKeys = Object.keys(aRec);
  if (aKeys.length !== Object.keys(bRec).length) return false;
  return aKeys.every((k) => Object.is(aRec[k], bRec[k]));
}

/**
 * Diffs one render's props against the previous render's. `prev === null`
 * means this is the mount render — every prop is reported as changed with
 * `prevValue: undefined`, feeding the `mount` rule directly (renderReason.ts
 * short-circuits on phase before ever reading this, but the diff is still
 * useful for the Phase 5 "initial props" display).
 */
export function diffProps(
  prev: Record<string, unknown> | null,
  next: Record<string, unknown>,
): PropDiffEntry[] {
  const keys = new Set([...(prev ? Object.keys(prev) : []), ...Object.keys(next)]);
  const diffs: PropDiffEntry[] = [];
  for (const key of keys) {
    const prevValue = prev ? prev[key] : undefined;
    const nextValue = next[key];
    const referenceEqual = prev !== null && Object.is(prevValue, nextValue);
    diffs.push({
      key,
      prevValue,
      nextValue,
      referenceEqual,
      shallowEqual: prev !== null && (referenceEqual || shallowEqualValue(prevValue, nextValue)),
      valueType: classifyValue(nextValue),
    });
  }
  return diffs;
}

/** Rule 2 of the render-reason heuristic: any prop whose shallow-equality check failed. */
export function hasChangedProps(diffs: PropDiffEntry[]): boolean {
  return diffs.some((d) => !d.shallowEqual);
}
