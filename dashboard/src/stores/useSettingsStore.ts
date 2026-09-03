import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  apiBaseUrl: string;
  apiKey: string;
}

interface SettingsActions {
  setApiBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787',
      apiKey: '',
      setApiBaseUrl: (apiBaseUrl) => set({ apiBaseUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
    }),
    { name: 'renderlab-settings' },
  ),
);
