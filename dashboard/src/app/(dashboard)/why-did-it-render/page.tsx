'use client';

import { useMemo } from 'react';
import { useSessionEvents } from '../../../queries/useSessionEvents';
import { useSessionsWithDefaultSelection } from '../../../queries/useSessionsWithDefaultSelection';
import { useSessionSelectionStore } from '../../../stores/useSessionSelectionStore';
import { useTimelineStore } from '../../../stores/useTimelineStore';
import { LoadingState } from '../../../components/shared/LoadingState';
import { ErrorState } from '../../../components/shared/ErrorState';
import { EmptyState } from '../../../components/shared/EmptyState';
import { SessionPicker } from '../../../components/shared/SessionPicker';
import { Timeline } from '../../../components/timeline/Timeline';
import { WhyDidItRenderPanel } from '../../../components/why-did-it-render/WhyDidItRenderPanel';

/**
 * The same Timeline component as the render-timeline view, filtered to
 * `avoidableOnly` (ARCHITECTURE.md §3.2 point 4's partial index) — this is
 * deliberately a reuse, not a parallel implementation: "why did it render"
 * is the timeline scoped to the renders worth acting on.
 */
export default function WhyDidItRenderPage(): React.JSX.Element {
  const sessionsQuery = useSessionsWithDefaultSelection();
  const selectedSessionId = useSessionSelectionStore((state) => state.selectedSessionId);
  const selectSession = useSessionSelectionStore((state) => state.selectSession);
  const selectedEvent = useTimelineStore((state) => state.selectedEvent);
  const selectEvent = useTimelineStore((state) => state.selectEvent);

  const eventsQuery = useSessionEvents(selectedSessionId, { avoidableOnly: true });
  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.events) ?? [],
    [eventsQuery.data],
  );

  return (
    <div className="page">
      <header className="page__header">
        <h1>Why Did It Render?</h1>
        {sessionsQuery.data && sessionsQuery.data.length > 0 ? (
          <SessionPicker
            sessions={sessionsQuery.data}
            selectedSessionId={selectedSessionId}
            onChange={selectSession}
          />
        ) : null}
      </header>

      {sessionsQuery.isLoading ? <LoadingState label="Loading sessions…" /> : null}
      {sessionsQuery.isError ? (
        <ErrorState
          message={sessionsQuery.error.message}
          onRetry={() => void sessionsQuery.refetch()}
        />
      ) : null}
      {sessionsQuery.isSuccess && sessionsQuery.data.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          description="Once your app sends its first batch of render events, sessions will show up here."
        />
      ) : null}

      {sessionsQuery.isSuccess && sessionsQuery.data.length > 0 ? (
        <>
          {eventsQuery.isLoading ? <LoadingState label="Loading avoidable renders…" /> : null}
          {eventsQuery.isError ? (
            <ErrorState
              message={eventsQuery.error.message}
              onRetry={() => void eventsQuery.refetch()}
            />
          ) : null}
          {eventsQuery.isSuccess && events.length === 0 ? (
            <EmptyState
              title="No avoidable renders detected"
              description="Every render in this session was mount-, props-, state-, or context-driven — nice!"
            />
          ) : null}
          {eventsQuery.isSuccess && events.length > 0 ? (
            <div className="timeline-layout">
              <Timeline
                events={events}
                hasNextPage={eventsQuery.hasNextPage}
                isFetchingNextPage={eventsQuery.isFetchingNextPage}
                onLoadMore={() => void eventsQuery.fetchNextPage()}
                selectedEventId={selectedEvent?.id ?? null}
                onSelect={(event) => selectEvent({ id: event.id, ts: event.ts })}
              />
              <WhyDidItRenderPanel sessionId={selectedSessionId} event={selectedEvent} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
