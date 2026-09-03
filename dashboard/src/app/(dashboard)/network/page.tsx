'use client';

import { useSessionsWithDefaultSelection } from '../../../queries/useSessionsWithDefaultSelection';
import { useSessionSelectionStore } from '../../../stores/useSessionSelectionStore';
import { LoadingState } from '../../../components/shared/LoadingState';
import { ErrorState } from '../../../components/shared/ErrorState';
import { EmptyState } from '../../../components/shared/EmptyState';
import { SessionPicker } from '../../../components/shared/SessionPicker';
import { LongTaskList } from '../../../components/network/LongTaskList';
import { NetworkRequestTable } from '../../../components/network/NetworkRequestTable';

export default function NetworkPage(): React.JSX.Element {
  const sessionsQuery = useSessionsWithDefaultSelection();
  const selectedSessionId = useSessionSelectionStore((state) => state.selectedSessionId);
  const selectSession = useSessionSelectionStore((state) => state.selectSession);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Network</h1>
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
        <div className="network-layout">
          <LongTaskList sessionId={selectedSessionId} />
          <NetworkRequestTable sessionId={selectedSessionId} />
        </div>
      ) : null}
    </div>
  );
}
