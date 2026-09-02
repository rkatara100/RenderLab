import { create } from 'zustand';

interface TimelineState {
  selectedEventId: string | null;
}

interface TimelineActions {
  selectEvent: (eventId: string | null) => void;
}

/**
 * Scoped to what Phase 4 actually needs: `selectedEventId` drives the
 * Phase 5 why-did-it-render panel once it exists. `zoomLevel` and `playback`
 * from ARCHITECTURE.md §7 are Phase 7 (replay) concerns — added when that
 * phase needs them, not speculatively now.
 */
export const useTimelineStore = create<TimelineState & TimelineActions>((set) => ({
  selectedEventId: null,
  selectEvent: (selectedEventId) => set({ selectedEventId }),
}));
