import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorState } from '../src/components/shared/ErrorState';

describe('ErrorState', () => {
  it('offers a path to signup or settings when no api key is configured', () => {
    render(<ErrorState message="No API key configured. Add one in Settings to load data." />);

    expect(screen.getByRole('link', { name: /create a project/i })).toHaveAttribute(
      'href',
      '/signup',
    );
    expect(screen.getByRole('link', { name: /already have a key/i })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('offers a settings link when the key was rejected', () => {
    render(<ErrorState message="That API key was rejected. Check it in Settings." />);

    expect(screen.getByRole('link', { name: /update key in settings/i })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('falls back to a generic message with only Retry for other errors', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Request failed with status 500." onRetry={onRetry} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('omits Retry when onRetry is not provided', () => {
    render(<ErrorState message="Request failed with status 500." />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});
