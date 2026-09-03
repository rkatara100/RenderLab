import { create } from 'zustand';

export interface SelectedEventRef {
  id: string;

  ts: string;
}

interface TimelineState {
  selectedEvent: SelectedEventRef | null;
}

interface TimelineActions {
  selectEvent: (event: SelectedEventRef | null) => void;
}

export const useTimelineStore = create<TimelineState & TimelineActions>((set) => ({
  selectedEvent: null,
  selectEvent: (selectedEvent) => set({ selectedEvent }),
}));
