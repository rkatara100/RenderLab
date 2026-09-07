import { afterEach, describe, expect, it, vi } from 'vitest';

async function importFreshStore() {
  vi.resetModules();
  return import('../src/stores/useSettingsStore');
}

describe('useSettingsStore default apiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses the configured env var when present', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://custom.example.com');
    const { useSettingsStore } = await importFreshStore();
    expect(useSettingsStore.getState().apiBaseUrl).toBe('https://custom.example.com');
  });

  it('falls back to localhost outside production when unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    vi.stubEnv('NODE_ENV', 'test');
    const { useSettingsStore } = await importFreshStore();
    expect(useSettingsStore.getState().apiBaseUrl).toBe('http://localhost:8787');
  });

  it('falls back to the hosted API in production, with a console warning, rather than localhost', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { useSettingsStore } = await importFreshStore();

    expect(useSettingsStore.getState().apiBaseUrl).toBe(
      'https://renderlab-production.up.railway.app',
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/NEXT_PUBLIC_API_BASE_URL/));
  });
});
