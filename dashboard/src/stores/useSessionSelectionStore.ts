import { create } from 'zustand';

interface SessionSelectionState {
  selectedSessionId: string | null;
}

interface SessionSelectionActions {
  selectSession: (sessionId: string | null) => void;
}

/**
 * "Which session am I looking at" is shared across the tree, timeline, and
 * why-did-it-render views (ARCHITECTURE.md §7 — this is the seam
 * `useFilterStore` formalizes further in Phase 8, once time-range/search
 * filters join it). Pulled out of the tree-specific store in Phase 4 so the
 * timeline view doesn't need its own, disconnected session picker.
 */
export const useSessionSelectionStore = create<SessionSelectionState & SessionSelectionActions>(
  (set) => ({
    selectedSessionId: null,
    selectSession: (selectedSessionId) => set({ selectedSessionId }),
  }),
);
