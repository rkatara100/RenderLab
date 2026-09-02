import { create } from 'zustand';

interface ComponentTreeState {
  selectedComponentId: number | null;
  hoveredComponentId: number | null;
  treeSearchQuery: string;
  showOnlyReRendered: boolean;
}

interface ComponentTreeActions {
  selectComponent: (componentId: number | null) => void;
  setHovered: (componentId: number | null) => void;
  setSearchQuery: (query: string) => void;
  toggleShowOnlyReRendered: () => void;
}

/** UI-only state for the component tree view (ARCHITECTURE.md §7). Session
 * selection lives in `useSessionSelectionStore` — it's shared with the
 * timeline view, not tree-specific. */
export const useComponentTreeStore = create<ComponentTreeState & ComponentTreeActions>((set) => ({
  selectedComponentId: null,
  hoveredComponentId: null,
  treeSearchQuery: '',
  showOnlyReRendered: false,

  selectComponent: (selectedComponentId) => set({ selectedComponentId }),
  setHovered: (hoveredComponentId) => set({ hoveredComponentId }),
  setSearchQuery: (treeSearchQuery) => set({ treeSearchQuery }),
  toggleShowOnlyReRendered: () =>
    set((state) => ({ showOnlyReRendered: !state.showOnlyReRendered })),
}));
