import { create } from 'zustand';

export interface SelectedEventRef {
  id: string;
  /** Required alongside `id` — the detail API is looked up by
   * (sessionId, ts, id) to stay indexed under partitioning (see
   * api/src/db/repository.ts's getRenderEventDetail), not by id alone. The
   * timeline row the user clicked already has `ts`, so capturing both here
   * costs nothing. */
  ts: string;
}

interface TimelineState {
  selectedEvent: SelectedEventRef | null;
}

interface TimelineActions {
  selectEvent: (event: SelectedEventRef | null) => void;
}

/**
 * Scoped to what Phase 4/5 actually need: `selectedEvent` drives the
 * why-did-it-render panel. `zoomLevel` and `playback` from ARCHITECTURE.md
 * §7 are Phase 7 (replay) concerns — added when that phase needs them, not
 * speculatively now.
 */
export const useTimelineStore = create<TimelineState & TimelineActions>((set) => ({
  selectedEvent: null,
  selectEvent: (selectedEvent) => set({ selectedEvent }),
}));
