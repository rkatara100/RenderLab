'use client';

import { useReplayEvents } from '../../../queries/useReplayEvents';
import { useSessionsWithDefaultSelection } from '../../../queries/useSessionsWithDefaultSelection';
import { useSessionSelectionStore } from '../../../stores/useSessionSelectionStore';
import { LoadingState } from '../../../components/shared/LoadingState';
import { ErrorState } from '../../../components/shared/ErrorState';
import { EmptyState } from '../../../components/shared/EmptyState';
import { SessionPicker } from '../../../components/shared/SessionPicker';
import { ReplayPlayer } from '../../../components/replay/ReplayPlayer';

export default function ReplayPage(): React.JSX.Element {
  const sessionsQuery = useSessionsWithDefaultSelection();
  const selectedSessionId = useSessionSelectionStore((state) => state.selectedSessionId);
  const selectSession = useSessionSelectionStore((state) => state.selectSession);

  const replayQuery = useReplayEvents(selectedSessionId);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Replay</h1>
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
        <ErrorState message={sessionsQuery.error.message} onRetry={() => void sessionsQuery.refetch()} />
      ) : null}
      {sessionsQuery.isSuccess && sessionsQuery.data.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          description="Once your app sends its first batch of render events, sessions will show up here."
        />
      ) : null}

      {sessionsQuery.isSuccess && sessionsQuery.data.length > 0 ? (
        <>
          {replayQuery.isLoading ? <LoadingState label="Loading replay…" /> : null}
          {replayQuery.isError ? (
            <ErrorState message={replayQuery.error.message} onRetry={() => void replayQuery.refetch()} />
          ) : null}
          {replayQuery.isSuccess && replayQuery.data.events.length === 0 ? (
            <EmptyState
              title="No renders recorded"
              description="This session hasn't produced any render events yet."
            />
          ) : null}
          {replayQuery.isSuccess && replayQuery.data.events.length > 0 ? (
            <>
              {replayQuery.data.truncated ? (
                <p className="offline-banner">
                  Showing the most recent {replayQuery.data.events.length} events — this session has
                  more than that.
                </p>
              ) : null}
              <ReplayPlayer events={replayQuery.data.events} />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
