import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type DashboardView =
  'tree' | 'timeline' | 'why-did-it-render' | 'replay' | 'network' | 'settings';

export interface Toast {
  id: string;
  message: string;
  variant: 'info' | 'error' | 'success';
}

interface UIState {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  sidebarCollapsed: boolean;
  activeView: DashboardView;
  isOffline: boolean;
  toast: Toast | null;
}

interface UIActions {
  setTheme: (theme: ThemePreference) => void;
  applySystemTheme: (systemIsDark: boolean) => void;
  toggleSidebar: () => void;
  setActiveView: (view: DashboardView) => void;
  setOffline: (isOffline: boolean) => void;
  showToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: () => void;
}

function resolve(theme: ThemePreference, systemIsDark: boolean): ResolvedTheme {
  return theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;
}

export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: 'light',
      sidebarCollapsed: false,
      activeView: 'tree',
      isOffline: false,
      toast: null,

      setTheme: (theme) => {
        const systemIsDark =
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches;
        set({ theme, resolvedTheme: resolve(theme, systemIsDark) });
      },
      applySystemTheme: (systemIsDark) => {
        set({ resolvedTheme: resolve(get().theme, systemIsDark) });
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setActiveView: (activeView) => set({ activeView }),
      setOffline: (isOffline) => set({ isOffline }),
      showToast: (toast) => set({ toast: { ...toast, id: crypto.randomUUID() } }),
      dismissToast: () => set({ toast: null }),
    }),
    { name: 'renderlab-ui', partialize: (s) => ({ theme: s.theme }) },
  ),
);
