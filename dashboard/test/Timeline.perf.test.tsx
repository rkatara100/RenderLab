// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { RenderTimelineEvent } from '@renderlab/shared-types';
import { Timeline } from '../src/components/timeline/Timeline';

/**
 * jsdom has no real layout engine: every element's `offsetWidth`/`offsetHeight`
 * is 0, which is exactly what `@tanstack/react-virtual` reads for its initial
 * synchronous measurement (before `ResizeObserver` — itself unimplemented in
 * jsdom — would report anything further). Stubbing a realistic scroll
 * container size here is what makes the virtualizer compute a genuine
 * visible-row window instead of an empty one; a real browser needs no such
 * stub.
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 520 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

function makeEvents(count: number): RenderTimelineEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    ts: new Date(Date.now() - index * 1000).toISOString(),
    durationMs: 0.5,
    renderReason: 'unknown',
    isAvoidable: false,
    componentId: 1,
    componentName: 'Component',
  }));
}

function renderTimeline(
  events: RenderTimelineEvent[],
  overrides: Partial<React.ComponentProps<typeof Timeline>> = {},
) {
  return render(
    <Timeline
      events={events}
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => {}}
      selectedEventId={null}
      onSelect={() => {}}
      {...overrides}
    />,
  );
}

describe('Timeline virtualization — proof, not just a claim', () => {
  it('renders a small, bounded number of DOM rows for a 10,000-event session', () => {
    const { container } = renderTimeline(makeEvents(10_000));
    const renderedRowCount = container.querySelectorAll('.timeline-row').length;

    // Viewport is 520px / 32px rows ≈ 16 visible + up to 10 rows of overscan
    // on each side ≈ ~37 max. The real claim: nowhere near the 10,000 total.
    expect(renderedRowCount).toBeGreaterThan(0);
    expect(renderedRowCount).toBeLessThan(60);
  });

  it('renders the same row count for 100 events as for 10,000 — O(viewport), not O(dataset)', () => {
    const smallRun = renderTimeline(makeEvents(100));
    const smallRowCount = smallRun.container.querySelectorAll('.timeline-row').length;
    smallRun.unmount();

    const largeRun = renderTimeline(makeEvents(10_000));
    const largeRowCount = largeRun.container.querySelectorAll('.timeline-row').length;
    largeRun.unmount();

    expect(largeRowCount).toBe(smallRowCount);
  });

  it('requests the next page once the loaded events run out, rather than requiring the whole session upfront', () => {
    const onLoadMore = vi.fn();
    // Fewer events than the prefetch threshold — the visible window is
    // already within range of the end of what's loaded.
    renderTimeline(makeEvents(5), { hasNextPage: true, onLoadMore });
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('does not request more once every page has been loaded', () => {
    const onLoadMore = vi.fn();
    renderTimeline(makeEvents(5), { hasNextPage: false, onLoadMore });
    expect(onLoadMore).not.toHaveBeenCalled();
  });
});
