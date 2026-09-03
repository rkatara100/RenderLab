
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LongTaskPage } from '@renderlab/shared-types';
import { LongTaskList } from '../src/components/network/LongTaskList';
import { useSettingsStore } from '../src/stores/useSettingsStore';

function renderList(sessionId: string | null, response?: LongTaskPage) {
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
      <LongTaskList sessionId={sessionId} />
    </QueryClientProvider>,
  );
}

describe('LongTaskList', () => {
  beforeEach(() => {
    useSettingsStore.setState({ apiBaseUrl: 'http://api.test', apiKey: 'key-123' });
  });

  it('shows an empty state when no long tasks were captured', async () => {
    renderList('sess-1', { tasks: [], nextCursor: null });
    await waitFor(() => expect(screen.getByText(/no long tasks detected/i)).toBeInTheDocument());
  });

  it('lists tasks with their correlated components', async () => {
    renderList('sess-1', {
      tasks: [
        {
          id: '1',
          ts: '2026-01-01T00:00:00.000Z',
          durationMs: 88,
          attribution: ['script'],
          correlatedComponentNames: ['SearchBox', 'ResultsList'],
        },
      ],
      nextCursor: null,
    });

    await waitFor(() => expect(screen.getByText(/88\.00ms/)).toBeInTheDocument());
    expect(screen.getByText('SearchBox, ResultsList')).toBeInTheDocument();
  });

  it('shows a placeholder when a task has no correlated components', async () => {
    renderList('sess-1', {
      tasks: [
        {
          id: '1',
          ts: '2026-01-01T00:00:00.000Z',
          durationMs: 60,
          attribution: [],
          correlatedComponentNames: [],
        },
      ],
      nextCursor: null,
    });

    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument());
  });

  it('shows an error state with retry when the fetch fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(
      <QueryClientProvider client={queryClient}>
        <LongTaskList sessionId="sess-1" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
