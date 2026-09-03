
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NetworkRequestPage } from '@renderlab/shared-types';
import { NetworkRequestTable } from '../src/components/network/NetworkRequestTable';
import { useSettingsStore } from '../src/stores/useSettingsStore';

function renderTable(sessionId: string | null, response?: NetworkRequestPage) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
    }),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <NetworkRequestTable sessionId={sessionId} />
    </QueryClientProvider>,
  );
}

describe('NetworkRequestTable', () => {
  beforeEach(() => {
    useSettingsStore.setState({ apiBaseUrl: 'http://api.test', apiKey: 'key-123' });
  });

  it('shows an empty state when no requests were captured', async () => {
    renderTable('sess-1', { requests: [], nextCursor: null });
    await waitFor(() =>
      expect(screen.getByText(/no network requests captured/i)).toBeInTheDocument(),
    );
  });

  it('lists requests with status, duration, and formatted size', async () => {
    renderTable('sess-1', {
      requests: [
        {
          id: '1',
          ts: '2026-01-01T00:00:00.000Z',
          url: 'https://api.example.com/orders',
          method: 'UNKNOWN',
          status: 200,
          durationMs: 42,
          initiatorType: 'fetch',
          transferSize: 2048,
        },
      ],
      nextCursor: null,
    });

    await waitFor(() =>
      expect(screen.getByText('https://api.example.com/orders')).toBeInTheDocument(),
    );
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('2.0KB')).toBeInTheDocument();
  });

  it('shows a placeholder status for requests with no status available', async () => {
    renderTable('sess-1', {
      requests: [
        {
          id: '1',
          ts: '2026-01-01T00:00:00.000Z',
          url: 'https://cdn.example.com/data',
          method: 'UNKNOWN',
          status: null,
          durationMs: 10,
          initiatorType: 'fetch',
          transferSize: null,
        },
      ],
      nextCursor: null,
    });

    await waitFor(() => expect(screen.getByText('https://cdn.example.com/data')).toBeInTheDocument());
    const row = screen.getByText('https://cdn.example.com/data').closest('tr');
    expect(row).not.toBeNull();
    expect(row?.className).not.toContain('network-table__row--error');
  });

  it('flags 4xx/5xx responses with the error row class', async () => {
    renderTable('sess-1', {
      requests: [
        {
          id: '1',
          ts: '2026-01-01T00:00:00.000Z',
          url: 'https://api.example.com/orders',
          method: 'UNKNOWN',
          status: 500,
          durationMs: 12,
          initiatorType: 'fetch',
          transferSize: null,
        },
      ],
      nextCursor: null,
    });

    await waitFor(() =>
      expect(screen.getByText('https://api.example.com/orders')).toBeInTheDocument(),
    );
    const row = screen.getByText('https://api.example.com/orders').closest('tr');
    expect(row?.className).toContain('network-table__row--error');
  });

  it('shows an error state with retry when the fetch fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(
      <QueryClientProvider client={queryClient}>
        <NetworkRequestTable sessionId="sess-1" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
