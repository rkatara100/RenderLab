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

const PREFETCH_ROW_THRESHOLD = 20;

export function Timeline({
  events,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  selectedEventId,
  onSelect,
}: TimelineProps): React.JSX.Element {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
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
