import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Toaster } from '../src/components/shared/Toaster';
import { useUIStore } from '../src/stores/useUIStore';

describe('Toaster', () => {
  afterEach(() => {
    useUIStore.setState({ toast: null });
    vi.useRealTimers();
  });

  it('renders nothing when there is no toast', () => {
    useUIStore.setState({ toast: null });
    render(<Toaster />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the active toast message', () => {
    useUIStore.setState({ toast: { id: '1', message: 'Keys rotated', variant: 'success' } });
    render(<Toaster />);
    expect(screen.getByText('Keys rotated')).toBeInTheDocument();
  });

  it('dismisses when the close button is clicked', async () => {
    useUIStore.setState({ toast: { id: '1', message: 'Keys rotated', variant: 'success' } });
    render(<Toaster />);

    screen.getByRole('button', { name: /dismiss/i }).click();

    await waitFor(() => expect(useUIStore.getState().toast).toBeNull());
  });

  it('auto-dismisses after the timeout', () => {
    vi.useFakeTimers();
    useUIStore.setState({ toast: { id: '1', message: 'Keys rotated', variant: 'success' } });
    render(<Toaster />);

    vi.advanceTimersByTime(5000);

    expect(useUIStore.getState().toast).toBeNull();
  });
});
