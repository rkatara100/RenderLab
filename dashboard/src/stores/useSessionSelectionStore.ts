import { create } from 'zustand';

interface SessionSelectionState {
  selectedSessionId: string | null;
}

interface SessionSelectionActions {
  selectSession: (sessionId: string | null) => void;
}

export const useSessionSelectionStore = create<SessionSelectionState & SessionSelectionActions>(
  (set) => ({
    selectedSessionId: null,
    selectSession: (selectedSessionId) => set({ selectedSessionId }),
  }),
);
