import { useMemo } from 'react';
import { useLongTasks } from '../../queries/useLongTasks';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { EmptyState } from '../shared/EmptyState';
import { formatDurationMs } from '../../lib/format';

export interface LongTaskListProps {
  sessionId: string | null;
}

export function LongTaskList({ sessionId }: LongTaskListProps): React.JSX.Element {
  const query = useLongTasks(sessionId);
  const tasks = useMemo(() => query.data?.pages.flatMap((page) => page.tasks) ?? [], [query.data]);

  if (query.isLoading) return <LoadingState label="Loading long tasks…" />;
  if (query.isError) {
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  }
  if (query.isSuccess && tasks.length === 0) {
    return (
      <EmptyState
        title="No long tasks detected"
        description="Nothing blocked the main thread for 50ms or more in this session."
      />
    );
  }

  return (
    <section className="long-task-list" aria-label="Long tasks">
      <h2>Long tasks</h2>
      <ul className="long-task-list__rows">
        {tasks.map((task) => (
          <li key={task.id} className="long-task-list__row">
            <span className="long-task-list__time">{new Date(task.ts).toLocaleTimeString()}</span>
            <span className="long-task-list__duration">{formatDurationMs(task.durationMs)}</span>
            <span className="long-task-list__components">
              {task.correlatedComponentNames.length > 0
                ? task.correlatedComponentNames.join(', ')
                : '—'}
            </span>
          </li>
        ))}
      </ul>
      {query.hasNextPage ? (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}
