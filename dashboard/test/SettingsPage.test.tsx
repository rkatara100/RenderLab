import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SettingsPage from '../src/app/(dashboard)/settings/page';
import { useSettingsStore } from '../src/stores/useSettingsStore';
import { useUIStore } from '../src/stores/useUIStore';

describe('SettingsPage', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      apiBaseUrl: 'http://api.test',
      apiKey: 'old-dashboard-key',
      projectId: 'proj-1',
    });
    useUIStore.setState({ toast: null });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables rotation and explains why when there is no project id on file', () => {
    useSettingsStore.setState({ projectId: '' });
    render(<SettingsPage />);

    expect(screen.getByRole('button', { name: /rotate keys/i })).toBeDisabled();
    expect(screen.getByText(/no project id on file/i)).toBeInTheDocument();
  });

  it('asks for confirmation before rotating, and does nothing if declined', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<SettingsPage />);
    screen.getByRole('button', { name: /rotate keys/i }).click();

    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rotates keys, updates the stored dashboard key, and shows the new ingest key once', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ id: 'proj-1', ingestKey: 'rl_new_ingest', dashboardKey: 'rl_new_dash' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(<SettingsPage />);
    screen.getByRole('button', { name: /rotate keys/i }).click();

    await waitFor(() => expect(screen.getByText('rl_new_ingest')).toBeInTheDocument());
    expect(useSettingsStore.getState().apiKey).toBe('rl_new_dash');

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/projects/proj-1/rotate');
    expect((options.headers as Record<string, string>).Authorization).toBe(
      'Bearer old-dashboard-key',
    );
  });

  it('shows an error toast without touching stored keys when rotation is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'too many key rotations, try again later' }),
      }),
    );

    render(<SettingsPage />);
    screen.getByRole('button', { name: /rotate keys/i }).click();

    await waitFor(() =>
      expect(useUIStore.getState().toast?.message).toBe('too many key rotations, try again later'),
    );
    expect(useSettingsStore.getState().apiKey).toBe('old-dashboard-key');
  });
});
