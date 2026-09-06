'use client';

import { useMemo } from 'react';
import { useSessionEvents } from '../../../queries/useSessionEvents';
import { useSessionsWithDefaultSelection } from '../../../queries/useSessionsWithDefaultSelection';
import { useSessionSelectionStore } from '../../../stores/useSessionSelectionStore';
import { useTimelineStore } from '../../../stores/useTimelineStore';
import { useFilterStore, resolveTimeRange } from '../../../stores/useFilterStore';
import { LoadingState } from '../../../components/shared/LoadingState';
import { ErrorState } from '../../../components/shared/ErrorState';
import { EmptyState } from '../../../components/shared/EmptyState';
import { SessionPicker } from '../../../components/shared/SessionPicker';
import { Timeline } from '../../../components/timeline/Timeline';
import { TimelineFilterBar } from '../../../components/timeline/TimelineFilterBar';
import { WhyDidItRenderPanel } from '../../../components/why-did-it-render/WhyDidItRenderPanel';

export default function TimelinePage(): React.JSX.Element {
  const sessionsQuery = useSessionsWithDefaultSelection();
  const selectedSessionId = useSessionSelectionStore((state) => state.selectedSessionId);
  const selectSession = useSessionSelectionStore((state) => state.selectSession);
  const selectedEvent = useTimelineStore((state) => state.selectedEvent);
  const selectEvent = useTimelineStore((state) => state.selectEvent);

  const searchQuery = useFilterStore((state) => state.searchQuery);
  const renderReasonFilter = useFilterStore((state) => state.renderReasonFilter);
  const timeRangePreset = useFilterStore((state) => state.timeRangePreset);

  const eventsQuery = useSessionEvents(selectedSessionId, {
    search: searchQuery,
    renderReasons: renderReasonFilter,
    ...resolveTimeRange(timeRangePreset),
  });
  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.events) ?? [],
    [eventsQuery.data],
  );

  return (
    <div className="page">
      <header className="page__header">
        <h1>Render Timeline</h1>
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
          <TimelineFilterBar />
          {eventsQuery.isLoading ? <LoadingState label="Loading render events…" /> : null}
          {eventsQuery.isError ? (
            <ErrorState
              message={eventsQuery.error.message}
              onRetry={() => void eventsQuery.refetch()}
            />
          ) : null}
          {eventsQuery.isSuccess && events.length === 0 ? (
            <EmptyState
              title="No renders recorded"
              description="This session hasn't produced any render events yet."
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
