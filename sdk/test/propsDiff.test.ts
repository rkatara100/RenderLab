import { describe, expect, it } from 'vitest';
import { diffProps, hasChangedProps } from '../src/instrumentation/propsDiff.js';

describe('diffProps', () => {
  it('marks every prop changed on mount (prev === null)', () => {
    const diffs = diffProps(null, { a: 1, b: 'x' });
    expect(diffs).toHaveLength(2);
    for (const d of diffs) {
      expect(d.referenceEqual).toBe(false);
      expect(d.shallowEqual).toBe(false);
      expect(d.prevValue).toBeUndefined();
    }
  });

  it('flags identical references as both reference- and shallow-equal', () => {
    const items = [1, 2, 3];
    const diffs = diffProps({ items }, { items });
    expect(diffs[0]).toMatchObject({ referenceEqual: true, shallowEqual: true });
  });

  it('flags a new-reference-but-same-shape object as shallow-equal, not reference-equal', () => {
    const diffs = diffProps({ style: { color: 'red' } }, { style: { color: 'red' } });
    expect(diffs[0]).toMatchObject({ referenceEqual: false, shallowEqual: true });
  });

  it('flags a genuinely changed primitive as neither reference- nor shallow-equal', () => {
    const diffs = diffProps({ count: 1 }, { count: 2 });
    expect(diffs[0]).toMatchObject({ referenceEqual: false, shallowEqual: false });
  });

  it('classifies value types', () => {
    const diffs = diffProps(null, { fn: () => {}, arr: [1], obj: {}, prim: 1 });
    const byKey = Object.fromEntries(diffs.map((d) => [d.key, d.valueType]));
    expect(byKey).toEqual({ fn: 'function', arr: 'array', obj: 'object', prim: 'primitive' });
  });

  it('diffs added/removed keys against the union of both prop sets', () => {
    const diffs = diffProps({ a: 1 }, { b: 2 });
    const keys = diffs.map((d) => d.key).sort();
    expect(keys).toEqual(['a', 'b']);
  });
});

describe('hasChangedProps', () => {
  it('is false when every entry is shallow-equal', () => {
    expect(hasChangedProps(diffProps({ a: 1 }, { a: 1 }))).toBe(false);
  });

  it('is true when any entry is not shallow-equal', () => {
    expect(hasChangedProps(diffProps({ a: 1 }, { a: 2 }))).toBe(true);
  });
});
