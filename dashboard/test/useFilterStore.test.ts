import { beforeEach, describe, expect, it } from 'vitest';
import { useFilterStore, resolveTimeRange } from '../src/stores/useFilterStore';

describe('useFilterStore', () => {
  beforeEach(() => {
    useFilterStore.setState({ searchQuery: '', renderReasonFilter: [], timeRangePreset: 'all' });
  });

  it('sets the search query', () => {
    useFilterStore.getState().setSearchQuery('SearchBox');
    expect(useFilterStore.getState().searchQuery).toBe('SearchBox');
  });

  it('toggles a render reason on, then off again', () => {
    useFilterStore.getState().toggleRenderReason('props-changed');
    expect(useFilterStore.getState().renderReasonFilter).toEqual(['props-changed']);

    useFilterStore.getState().toggleRenderReason('props-changed');
    expect(useFilterStore.getState().renderReasonFilter).toEqual([]);
  });

  it('tracks multiple toggled render reasons independently', () => {
    useFilterStore.getState().toggleRenderReason('mount');
    useFilterStore.getState().toggleRenderReason('parent-rerender');
    expect(useFilterStore.getState().renderReasonFilter).toEqual(['mount', 'parent-rerender']);
  });

  it('sets the time range preset', () => {
    useFilterStore.getState().setTimeRangePreset('15m');
    expect(useFilterStore.getState().timeRangePreset).toBe('15m');
  });

  it('reset restores the initial state', () => {
    useFilterStore.getState().setSearchQuery('x');
    useFilterStore.getState().toggleRenderReason('mount');
    useFilterStore.getState().setTimeRangePreset('1h');

    useFilterStore.getState().reset();

    expect(useFilterStore.getState()).toMatchObject({
      searchQuery: '',
      renderReasonFilter: [],
      timeRangePreset: 'all',
    });
  });
});

describe('resolveTimeRange', () => {
  it('returns an empty object for "all"', () => {
    expect(resolveTimeRange('all')).toEqual({});
  });

  it('resolves a preset to an ISO from-timestamp in the past', () => {
    const { from } = resolveTimeRange('5m');
    expect(from).toBeDefined();
    expect(new Date(from!).getTime()).toBeLessThan(Date.now());
  });
});
