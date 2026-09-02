'use client';

import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { RenderTimelineEvent } from '@renderlab/shared-types';

export interface TimelineProps {
  events: RenderTimelineEvent[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  selectedEventId: string | null;
  onSelect: (event: RenderTimelineEvent) => void;
}

const ROW_HEIGHT_PX = 32;
/** Fetch the next page once the visible window comes within this many rows
 * of the end of what's loaded — keeps scrolling smooth by prefetching
 * ahead of the user reaching the bottom, without loading a whole 10k+-event
 * session up front. */
const PREFETCH_ROW_THRESHOLD = 20;

/**
 * Virtualization approach: `@tanstack/react-virtual` (windowing), not a
 * custom implementation. It's a small (~a few KB), headless, actively
 * maintained library already in the same family as React Query (already a
 * dependency), and windowing — computing which rows are visible from scroll
 * offset + a fixed row height, rendering only those into the DOM — is a
 * solved problem; hand-rolling scroll math (and its edge cases: fast
 * scrolling, resize, momentum scrolling on trackpads) isn't warranted here.
 *
 * Why this scales to 10k+ events without jank: DOM node count is bounded by
 * the *viewport*, not the *dataset*. With a fixed `ROW_HEIGHT_PX` and no
 * dynamic per-row measurement, `getVirtualItems()` is an O(1) range query
 * (binary search over a size lookup, not a scan) — rendering 10 or 10,000
 * loaded events costs the same DOM work: viewport height ÷ row height rows,
 * plus a small overscan. This is proven, not just claimed: see
 * `test/Timeline.perf.test.tsx`, which renders a 10,000-event timeline and
 * asserts the actual DOM row count stays in the low dozens regardless.
 * Data volume itself is separately bounded by keyset-cursor pagination
 * (useSessionEvents.ts) — the client never holds more in memory than the
 * user has actually scrolled through.
 */
export function Timeline({
  events,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  selectedEventId,
  onSelect,
}: TimelineProps): React.JSX.Element {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // @tanstack/react-virtual returns getVirtualItems()/getTotalSize() functions the React
  // Compiler can't safely auto-memoize; this project doesn't use the React Compiler, so
  // it's inert here, and there's no alternative API from the library to avoid it.
  // eslint-disable-next-line react-hooks/incompatible-library -- see comment above
  const rowVirtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
    // Only matters before the first real ResizeObserver measurement lands
    // (a brief instant in real browsers); in a non-browser test environment
    // with no layout engine it's the only measurement that ever lands,
    // which is exactly what test/Timeline.perf.test.tsx relies on.
    initialRect: { width: 800, height: 520 },
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVisibleIndex = virtualRows[virtualRows.length - 1]?.index;

  useEffect(() => {
    if (lastVisibleIndex === undefined || !hasNextPage || isFetchingNextPage) return;
    if (lastVisibleIndex >= events.length - PREFETCH_ROW_THRESHOLD) {
      onLoadMore();
    }
  }, [lastVisibleIndex, events.length, hasNextPage, isFetchingNextPage, onLoadMore]);

  return (
    <div ref={scrollContainerRef} className="timeline" data-testid="timeline-scroll-container">
      <div className="timeline__spacer" style={{ height: rowVirtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => {
          const event = events[virtualRow.index];
          if (!event) return null;
          return (
            <div
              key={event.id}
              className={event.id === selectedEventId ? 'timeline-row is-selected' : 'timeline-row'}
              style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              onClick={() => onSelect(event)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(event);
                }
              }}
              role="row"
              tabIndex={0}
              aria-selected={event.id === selectedEventId}
            >
              <span className="timeline-row__time">{new Date(event.ts).toLocaleTimeString()}</span>
              <span className="timeline-row__component">{event.componentName}</span>
              <span className={`timeline-row__reason timeline-row__reason--${event.renderReason}`}>
                {event.renderReason}
              </span>
              <span className="timeline-row__duration">{event.durationMs.toFixed(2)}ms</span>
              {event.isAvoidable ? <span className="badge badge--warning">avoidable</span> : null}
            </div>
          );
        })}
      </div>
      {isFetchingNextPage ? <p className="timeline__loading-more">Loading more…</p> : null}
    </div>
  );
}
