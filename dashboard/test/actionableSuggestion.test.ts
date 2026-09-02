import { describe, expect, it } from 'vitest';
import type { RenderReason } from '@renderlab/shared-types';
import { getActionableSuggestion } from '../src/components/why-did-it-render/actionableSuggestion';

const ALL_REASONS: RenderReason[] = [
  'mount',
  'props-changed',
  'context-changed',
  'state-changed',
  'parent-rerender',
  'unknown',
];

describe('getActionableSuggestion', () => {
  it('returns a non-empty, distinct suggestion for every render reason', () => {
    const suggestions = ALL_REASONS.map((reason) => getActionableSuggestion(reason, 'SearchBox'));
    for (const suggestion of suggestions) {
      expect(suggestion.length).toBeGreaterThan(0);
    }
    expect(new Set(suggestions).size).toBe(ALL_REASONS.length);
  });

  it('suggests React.memo specifically for parent-rerender, naming the component', () => {
    expect(getActionableSuggestion('parent-rerender', 'SearchBox')).toContain('SearchBox');
    expect(getActionableSuggestion('parent-rerender', 'SearchBox')).toContain('React.memo');
  });

  it('suggests useRenderLabState/useTrackedContext for unknown', () => {
    const suggestion = getActionableSuggestion('unknown', 'SearchBox');
    expect(suggestion).toContain('useRenderLabState');
    expect(suggestion).toContain('useTrackedContext');
  });
});
