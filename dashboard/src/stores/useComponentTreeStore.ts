import { create } from 'zustand';

interface ComponentTreeState {
  selectedSessionId: string | null;
  selectedComponentId: number | null;
  hoveredComponentId: number | null;
  treeSearchQuery: string;
  showOnlyReRendered: boolean;
}

interface ComponentTreeActions {
  selectSession: (sessionId: string | null) => void;
  selectComponent: (componentId: number | null) => void;
  setHovered: (componentId: number | null) => void;
  setSearchQuery: (query: string) => void;
  toggleShowOnlyReRendered: () => void;
}

/** UI-only state for the component tree view (ARCHITECTURE.md §7) —
 * `selectedSessionId` is the one piece of client state every other query on
 * this view keys off (React Query's `queryKey`), so filters/selection and
 * fetch parameters stay in lockstep without duplicating state. */
export const useComponentTreeStore = create<ComponentTreeState & ComponentTreeActions>((set) => ({
  selectedSessionId: null,
  selectedComponentId: null,
  hoveredComponentId: null,
  treeSearchQuery: '',
  showOnlyReRendered: false,

  selectSession: (selectedSessionId) => set({ selectedSessionId, selectedComponentId: null }),
  selectComponent: (selectedComponentId) => set({ selectedComponentId }),
  setHovered: (hoveredComponentId) => set({ hoveredComponentId }),
  setSearchQuery: (treeSearchQuery) => set({ treeSearchQuery }),
  toggleShowOnlyReRendered: () => set((s) => ({ showOnlyReRendered: !s.showOnlyReRendered })),
}));
