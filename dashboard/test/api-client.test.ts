import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from '../src/lib/api-client';
import { useSettingsStore } from '../src/stores/useSettingsStore';

describe('apiFetch', () => {
  beforeEach(() => {
    useSettingsStore.setState({ apiBaseUrl: 'http://api.test', apiKey: 'key-123' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws without hitting the network when no API key is configured', async () => {
    useSettingsStore.setState({ apiKey: '' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(apiFetch('/api/sessions')).rejects.toThrow(ApiError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the configured key as a Bearer token', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    vi.stubGlobal('fetch', fetchSpy);

    await apiFetch('/api/sessions');
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer key-123');
  });

  it('wraps a network failure as a distinguishable ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(apiFetch('/api/sessions')).rejects.toMatchObject({ isNetworkError: true });
  });

  it('flags a 401 distinctly from other HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(apiFetch('/api/sessions')).rejects.toMatchObject({ status: 401 });
  });

  it('surfaces other non-2xx statuses as an ApiError with that status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(apiFetch('/api/sessions')).rejects.toMatchObject({ status: 500 });
  });

  it('returns the parsed JSON body on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sessions: [] }),
      }),
    );
    await expect(apiFetch('/api/sessions')).resolves.toEqual({ sessions: [] });
  });
});
