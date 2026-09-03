import { useMemo } from 'react';
import { useNetworkRequests } from '../../queries/useNetworkRequests';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { EmptyState } from '../shared/EmptyState';
import { formatDurationMs } from '../../lib/format';

export interface NetworkRequestTableProps {
  sessionId: string | null;
}

function formatTransferSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

export function NetworkRequestTable({ sessionId }: NetworkRequestTableProps): React.JSX.Element {
  const query = useNetworkRequests(sessionId);
  const requests = useMemo(
    () => query.data?.pages.flatMap((page) => page.requests) ?? [],
    [query.data],
  );

  if (query.isLoading) return <LoadingState label="Loading network requests…" />;
  if (query.isError) {
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  }
  if (query.isSuccess && requests.length === 0) {
    return (
      <EmptyState
        title="No network requests captured"
        description="No fetch/XHR calls were observed in this session."
      />
    );
  }

  return (
    <section className="network-table" aria-label="Network requests">
      <h2>Network requests</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">URL</th>
            <th scope="col">Status</th>
            <th scope="col">Duration</th>
            <th scope="col">Size</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr
              key={request.id}
              className={
                request.status !== null && request.status >= 400
                  ? 'network-table__row--error'
                  : undefined
              }
            >
              <td>{new Date(request.ts).toLocaleTimeString()}</td>
              <td className="network-table__url">{request.url}</td>
              <td>{request.status ?? '—'}</td>
              <td>{formatDurationMs(request.durationMs)}</td>
              <td>{formatTransferSize(request.transferSize)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
