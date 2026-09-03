import { describe, expect, it } from 'vitest';
import {
  computeRenderReason,
  type RenderReasonInput,
} from '../src/instrumentation/renderReason.js';
import { diffProps } from '../src/instrumentation/propsDiff.js';

const base: RenderReasonInput = {
  phase: 'update',
  propsDiff: diffProps({ a: 1 }, { a: 1 }),
  contextDiff: [],
  stateChanged: null,
  isMemoized: false,
  parentRenderedThisCommit: false,
};

describe('computeRenderReason — ordered rule list, first match wins', () => {
  it('rule 1: mount short-circuits regardless of other signals', () => {
    const result = computeRenderReason({ ...base, phase: 'mount', parentRenderedThisCommit: true });
    expect(result.reason).toBe('mount');
  });

  it('rule 2: props-changed beats context/state/parent signals', () => {
    const result = computeRenderReason({
      ...base,
      propsDiff: diffProps({ a: 1 }, { a: 2 }),
      contextDiff: [{ contextName: 'Theme', referenceEqual: false }],
      stateChanged: true,
      parentRenderedThisCommit: true,
    });
    expect(result.reason).toBe('props-changed');
    expect(result.detail).toContain('a');
  });

  it('rule 3: context-changed fires when props are unchanged', () => {
    const result = computeRenderReason({
      ...base,
      contextDiff: [{ contextName: 'Theme', referenceEqual: false }],
      stateChanged: true,
      parentRenderedThisCommit: true,
    });
    expect(result.reason).toBe('context-changed');
  });

  it('rule 4: state-changed fires when props/context are unchanged', () => {
    const result = computeRenderReason({
      ...base,
      stateChanged: true,
      parentRenderedThisCommit: true,
    });
    expect(result.reason).toBe('state-changed');
  });

  it('rule 5: parent-rerender fires only when unmemoized and no local signal changed', () => {
    const result = computeRenderReason({
      ...base,
      parentRenderedThisCommit: true,
      isMemoized: false,
    });
    expect(result.reason).toBe('parent-rerender');
  });

  it('rule 5 does not fire for a memoized component', () => {
    const result = computeRenderReason({
      ...base,
      parentRenderedThisCommit: true,
      isMemoized: true,
    });
    expect(result.reason).toBe('unknown');
  });

  it('rule 6: unknown when no signal changed and nothing else applies', () => {
    const result = computeRenderReason(base);
    expect(result.reason).toBe('unknown');
  });
});
