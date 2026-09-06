import { create } from 'zustand';
import type { RenderReason } from '@renderlab/shared-types';

export type TimeRangePreset = 'all' | '5m' | '15m' | '1h';

export const TIME_RANGE_PRESET_MS: Record<Exclude<TimeRangePreset, 'all'>, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
};

interface FilterState {
  searchQuery: string;
  renderReasonFilter: RenderReason[];
  timeRangePreset: TimeRangePreset;
}

interface FilterActions {
  setSearchQuery: (searchQuery: string) => void;
  toggleRenderReason: (reason: RenderReason) => void;
  setTimeRangePreset: (preset: TimeRangePreset) => void;
  reset: () => void;
}

const initialState: FilterState = {
  searchQuery: '',
  renderReasonFilter: [],
  timeRangePreset: 'all',
};

export const useFilterStore = create<FilterState & FilterActions>((set) => ({
  ...initialState,
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleRenderReason: (reason) =>
    set((state) => ({
      renderReasonFilter: state.renderReasonFilter.includes(reason)
        ? state.renderReasonFilter.filter((r) => r !== reason)
        : [...state.renderReasonFilter, reason],
    })),
  setTimeRangePreset: (timeRangePreset) => set({ timeRangePreset }),
  reset: () => set(initialState),
}));

export function resolveTimeRange(preset: TimeRangePreset): { from?: string } {
  if (preset === 'all') return {};
  return { from: new Date(Date.now() - TIME_RANGE_PRESET_MS[preset]).toISOString() };
}
