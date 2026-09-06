import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignupPage from '../src/app/signup/page';
import { useSettingsStore } from '../src/stores/useSettingsStore';

function fillAndSubmit(): void {
  fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'My App' } });
  fireEvent.change(screen.getByLabelText(/owner email/i), {
    target: { value: 'owner@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: /create project/i }));
}

describe('SignupPage', () => {
  beforeEach(() => {
    useSettingsStore.setState({ apiBaseUrl: 'http://api.test', apiKey: '' });
  });

  it('shows the created API key and saves it to Settings on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'proj-1', apiKey: 'rl_abc123' }),
      }),
    );

    render(<SignupPage />);
    fillAndSubmit();

    await waitFor(() => expect(screen.getByText('rl_abc123')).toBeInTheDocument());
    expect(useSettingsStore.getState().apiKey).toBe('rl_abc123');
  });

  it('shows an error message when the API rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ error: 'a valid email is required' }),
      }),
    );

    render(<SignupPage />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText('a valid email is required')).toBeInTheDocument(),
    );
  });
});
