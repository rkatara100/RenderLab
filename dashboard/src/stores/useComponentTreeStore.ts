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
