import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSessionEvents } from '../src/queries/useSessionEvents';
import { useSettingsStore } from '../src/stores/useSettingsStore';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSessionEvents', () => {
  beforeEach(() => {
    useSettingsStore.setState({ apiBaseUrl: 'http://api.test', apiKey: 'key-123' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes search and renderReason in the request URL when provided', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ events: [], nextCursor: null }) });
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(
      () =>
        useSessionEvents('s1', {
          search: 'SearchBox',
          renderReasons: ['props-changed', 'parent-rerender'],
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('search=SearchBox');
    expect(url).toContain('renderReason=props-changed%2Cparent-rerender');
  });

  it('omits search and renderReason from the URL when not provided', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ events: [], nextCursor: null }) });
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useSessionEvents('s1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).not.toContain('search=');
    expect(url).not.toContain('renderReason=');
  });
});
