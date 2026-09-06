import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineFilterBar } from '../src/components/timeline/TimelineFilterBar';
import { useFilterStore } from '../src/stores/useFilterStore';

describe('TimelineFilterBar', () => {
  beforeEach(() => {
    useFilterStore.setState({ searchQuery: '', renderReasonFilter: [], timeRangePreset: 'all' });
  });

  it('typing in the search box updates the store', () => {
    render(<TimelineFilterBar />);
    fireEvent.change(screen.getByLabelText(/search component name/i), {
      target: { value: 'SearchBox' },
    });
    expect(useFilterStore.getState().searchQuery).toBe('SearchBox');
  });

  it('checking a render reason toggles it in the store', () => {
    render(<TimelineFilterBar />);
    fireEvent.click(screen.getByLabelText('props-changed'));
    expect(useFilterStore.getState().renderReasonFilter).toEqual(['props-changed']);

    fireEvent.click(screen.getByLabelText('props-changed'));
    expect(useFilterStore.getState().renderReasonFilter).toEqual([]);
  });

  it('picking a time range preset updates the store', () => {
    render(<TimelineFilterBar />);
    fireEvent.change(screen.getByLabelText(/time range/i), { target: { value: '1h' } });
    expect(useFilterStore.getState().timeRangePreset).toBe('1h');
  });
});
