
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderEventDetail } from '@renderlab/shared-types';
import { WhyDidItRenderPanel } from '../src/components/why-did-it-render/WhyDidItRenderPanel';
import { useSettingsStore } from '../src/stores/useSettingsStore';

function renderPanel(event: { id: string; ts: string } | null, response?: RenderEventDetail) {
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
      <WhyDidItRenderPanel sessionId="sess-1" event={event} />
    </QueryClientProvider>,
  );
}

describe('WhyDidItRenderPanel', () => {
  beforeEach(() => {
    useSettingsStore.setState({ apiBaseUrl: 'http://api.test', apiKey: 'key-123' });
  });

  it('shows a prompt to select a row when no event is selected', () => {
    renderPanel(null);
    expect(screen.getByText(/no render selected/i)).toBeInTheDocument();
  });

  it('shows the reason, detail, and an actionable suggestion once loaded', async () => {
    renderPanel(
      { id: '1', ts: '2026-01-01T00:00:00.000Z' },
      {
        id: '1',
        ts: '2026-01-01T00:00:00.000Z',
        durationMs: 0.8,
        renderReason: 'parent-rerender',
        isAvoidable: true,
        componentId: 1,
        componentName: 'SearchBox',
        reasonDetail: 'not memoized; re-rendered because an ancestor did',
        propsDiff: null,
        contextDiff: null,
      },
    );

    await waitFor(() => expect(screen.getByText('SearchBox')).toBeInTheDocument());
    expect(screen.getByText('parent-rerender')).toBeInTheDocument();
    expect(screen.getByText(/not memoized/i)).toBeInTheDocument();
    expect(screen.getByText(/React\.memo/)).toBeInTheDocument();
  });

  it('renders a props diff table when propsDiff is present', async () => {
    renderPanel(
      { id: '2', ts: '2026-01-01T00:00:00.000Z' },
      {
        id: '2',
        ts: '2026-01-01T00:00:00.000Z',
        durationMs: 0.4,
        renderReason: 'props-changed',
        isAvoidable: false,
        componentId: 1,
        componentName: 'SearchBox',
        reasonDetail: 'props.value changed',
        propsDiff: [
          {
            key: 'value',
            prevValue: 1,
            nextValue: 2,
            referenceEqual: false,
            shallowEqual: false,
            valueType: 'primitive',
          },
        ],
        contextDiff: null,
      },
    );

    await waitFor(() => expect(screen.getByText('value')).toBeInTheDocument());
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows an error state with retry when the detail fetch fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(
      <QueryClientProvider client={queryClient}>
        <WhyDidItRenderPanel
          sessionId="sess-1"
          event={{ id: '3', ts: '2026-01-01T00:00:00.000Z' }}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
