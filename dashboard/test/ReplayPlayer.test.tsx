import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ReplayEvent } from '@renderlab/shared-types';
import { ReplayPlayer } from '../src/components/replay/ReplayPlayer';
import { useReplayStore } from '../src/stores/useReplayStore';

function makeEvent(overrides: Partial<ReplayEvent> = {}): ReplayEvent {
  return {
    id: '1',
    ts: '2026-01-01T00:00:00.000Z',
    durationMs: 0.5,
    renderReason: 'mount',
    isAvoidable: false,
    componentId: 1,
    componentName: 'App',
    phase: 'mount',
    componentPath: ['App#0'],
    commitTime: 10,
    ...overrides,
  };
}

describe('ReplayPlayer', () => {
  beforeEach(() => {
    useReplayStore.setState({ status: 'paused', cursorIndex: 0, speed: 1 });
  });

  it('renders the first frame by default', () => {
    render(
      <ReplayPlayer
        events={[
          makeEvent({ id: '1', commitTime: 10 }),
          makeEvent({ id: '2', commitTime: 20, componentName: 'SearchBox', componentPath: ['App#0', 'SearchBox#0'] }),
        ]}
      />,
    );
    expect(screen.getByText(/frame 1 \/ 2/i)).toBeInTheDocument();
  });

  it('scrubbing the slider advances the cursor', () => {
    render(
      <ReplayPlayer
        events={[
          makeEvent({ id: '1', commitTime: 10 }),
          makeEvent({ id: '2', commitTime: 20 }),
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/replay scrubber/i), { target: { value: '1' } });
    expect(screen.getByText(/frame 2 \/ 2/i)).toBeInTheDocument();
  });

  it('play advances the cursor automatically over time', () => {
    vi.useFakeTimers();
    render(
      <ReplayPlayer
        events={[
          makeEvent({ id: '1', commitTime: 10 }),
          makeEvent({ id: '2', commitTime: 20 }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText(/frame 2 \/ 2/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows an empty message when there are no events', () => {
    render(<ReplayPlayer events={[]} />);
    expect(screen.getByText(/no render frames to replay/i)).toBeInTheDocument();
  });
});
