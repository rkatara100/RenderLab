'use client';

import { useEffect } from 'react';
import { useSessions } from '../../../queries/useSessions';
import { useSessionComponents } from '../../../queries/useSessionComponents';
import { useComponentTreeStore } from '../../../stores/useComponentTreeStore';
import { LoadingState } from '../../../components/shared/LoadingState';
import { ErrorState } from '../../../components/shared/ErrorState';
import { EmptyState } from '../../../components/shared/EmptyState';
import { ComponentTree } from '../../../components/tree/ComponentTree';

export default function TreePage(): React.JSX.Element {
  const sessions = useSessions();
  const {
    selectedSessionId,
    selectSession,
    selectedComponentId,
    selectComponent,
    treeSearchQuery,
    setSearchQuery,
    showOnlyReRendered,
    toggleShowOnlyReRendered,
  } = useComponentTreeStore();

  // Default to the most recent session once the list loads.
  useEffect(() => {
    if (!selectedSessionId && sessions.data && sessions.data.length > 0) {
      selectSession(sessions.data[0]?.id ?? null);
    }
  }, [sessions.data, selectedSessionId, selectSession]);

  const components = useSessionComponents(selectedSessionId);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Component Tree</h1>
        {sessions.data && sessions.data.length > 0 ? (
          <select
            aria-label="Session"
            value={selectedSessionId ?? ''}
            onChange={(e) => selectSession(e.target.value || null)}
          >
            {sessions.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.isLive ? '🟢 ' : ''}
                {s.url ?? s.id} — {new Date(s.startedAt).toLocaleString()}
              </option>
            ))}
          </select>
        ) : null}
      </header>

      {sessions.isLoading ? <LoadingState label="Loading sessions…" /> : null}
      {sessions.isError ? (
        <ErrorState message={sessions.error.message} onRetry={() => void sessions.refetch()} />
      ) : null}
      {sessions.isSuccess && sessions.data.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          description="Once your app sends its first batch of render events, sessions will show up here."
        />
      ) : null}

      {sessions.isSuccess && sessions.data.length > 0 ? (
        <>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Filter components…"
              value={treeSearchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter components"
            />
            <label>
              <input
                type="checkbox"
                checked={showOnlyReRendered}
                onChange={toggleShowOnlyReRendered}
              />
              Only re-rendered
            </label>
          </div>

          {components.isLoading ? <LoadingState label="Loading components…" /> : null}
          {components.isError ? (
            <ErrorState
              message={components.error.message}
              onRetry={() => void components.refetch()}
            />
          ) : null}
          {components.isSuccess ? (
            <ComponentTree
              components={components.data}
              searchQuery={treeSearchQuery}
              showOnlyReRendered={showOnlyReRendered}
              selectedComponentId={selectedComponentId}
              onSelect={selectComponent}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
