'use client';

import { useSessionComponents } from '../../../queries/useSessionComponents';
import { useSessionsWithDefaultSelection } from '../../../queries/useSessionsWithDefaultSelection';
import { useSessionSelectionStore } from '../../../stores/useSessionSelectionStore';
import { useComponentTreeStore } from '../../../stores/useComponentTreeStore';
import { LoadingState } from '../../../components/shared/LoadingState';
import { ErrorState } from '../../../components/shared/ErrorState';
import { EmptyState } from '../../../components/shared/EmptyState';
import { SessionPicker } from '../../../components/shared/SessionPicker';
import { ComponentTree } from '../../../components/tree/ComponentTree';

export default function TreePage(): React.JSX.Element {
  const sessionsQuery = useSessionsWithDefaultSelection();
  const selectedSessionId = useSessionSelectionStore((state) => state.selectedSessionId);
  const selectSession = useSessionSelectionStore((state) => state.selectSession);
  const {
    selectedComponentId,
    selectComponent,
    treeSearchQuery,
    setSearchQuery,
    showOnlyReRendered,
    toggleShowOnlyReRendered,
  } = useComponentTreeStore();

  const componentsQuery = useSessionComponents(selectedSessionId);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Component Tree</h1>
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

          {componentsQuery.isLoading ? <LoadingState label="Loading components…" /> : null}
          {componentsQuery.isError ? (
            <ErrorState
              message={componentsQuery.error.message}
              onRetry={() => void componentsQuery.refetch()}
            />
          ) : null}
          {componentsQuery.isSuccess ? (
            <ComponentTree
              components={componentsQuery.data}
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
