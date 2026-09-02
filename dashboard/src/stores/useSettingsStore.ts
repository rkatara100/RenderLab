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

/**
 * There's no human login system yet (ARCHITECTURE.md §3.5/§8) — the
 * dashboard authenticates to the ingestion/read API with the same
 * project-scoped API key the SDK uses. Until a real multi-user auth layer
 * exists, the Settings page is where a developer pastes their project's key,
 * persisted to this browser's localStorage only (never sent anywhere but
 * the configured API).
 */
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
