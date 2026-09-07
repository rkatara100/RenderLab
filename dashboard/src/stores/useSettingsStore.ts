import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const PRODUCTION_API_BASE_URL = 'https://renderlab-production.up.railway.app';

function resolveDefaultApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[RenderLab] NEXT_PUBLIC_API_BASE_URL is not set. Falling back to the RenderLab-hosted ' +
        'API. Set this env var to point the dashboard at your own deployment.',
    );
    return PRODUCTION_API_BASE_URL;
  }

  return 'http://localhost:8787';
}

interface SettingsState {
  apiBaseUrl: string;
  apiKey: string;
  projectId: string;
}

interface SettingsActions {
  setApiBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setProjectId: (projectId: string) => void;
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      apiBaseUrl: resolveDefaultApiBaseUrl(),
      apiKey: '',
      projectId: '',
      setApiBaseUrl: (apiBaseUrl) => set({ apiBaseUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
      setProjectId: (projectId) => set({ projectId }),
    }),
    { name: 'renderlab-settings' },
  ),
);
