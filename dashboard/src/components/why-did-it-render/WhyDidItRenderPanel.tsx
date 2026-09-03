import { useRenderEventDetail } from '../../queries/useRenderEventDetail';
import type { SelectedEventRef } from '../../stores/useTimelineStore';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { EmptyState } from '../shared/EmptyState';
import { getActionableSuggestion } from './actionableSuggestion';

export interface WhyDidItRenderPanelProps {
  sessionId: string | null;
  event: SelectedEventRef | null;
}

export function WhyDidItRenderPanel({
  sessionId,
  event,
}: WhyDidItRenderPanelProps): React.JSX.Element {
  const detailQuery = useRenderEventDetail(sessionId, event);

  if (!event) {
    return (
      <EmptyState
        title="No render selected"
        description="Select a row in the timeline to see why it rendered."
      />
    );
  }

  if (detailQuery.isLoading) return <LoadingState label="Loading render detail…" />;
  if (detailQuery.isError) {
    return (
      <ErrorState message={detailQuery.error.message} onRetry={() => void detailQuery.refetch()} />
    );
  }
  if (!detailQuery.isSuccess) return <EmptyState title="No detail available" />;

  const detail = detailQuery.data;

  return (
    <aside className="why-panel" aria-label="Why did it render">
      <h2 className="why-panel__title">{detail.componentName}</h2>
      <p className="why-panel__meta">
        {new Date(detail.ts).toLocaleTimeString()} · {detail.durationMs.toFixed(2)}ms
      </p>

      <div className={`why-panel__reason why-panel__reason--${detail.renderReason}`}>
        {detail.renderReason}
      </div>
      {detail.reasonDetail ? <p className="why-panel__detail">{detail.reasonDetail}</p> : null}

      <p className="why-panel__suggestion">
        {getActionableSuggestion(detail.renderReason, detail.componentName)}
      </p>

      {detail.propsDiff && detail.propsDiff.length > 0 ? (
        <>
          <h3>Props diff</h3>
          <table className="why-panel__diff-table">
            <thead>
              <tr>
                <th scope="col">Prop</th>
                <th scope="col">Previous</th>
                <th scope="col">Next</th>
                <th scope="col">Changed</th>
              </tr>
            </thead>
            <tbody>
              {detail.propsDiff.map((entry) => (
                <tr key={entry.key}>
                  <td>{entry.key}</td>
                  <td>{JSON.stringify(entry.prevValue)}</td>
                  <td>{JSON.stringify(entry.nextValue)}</td>
                  <td>{entry.shallowEqual ? 'no' : 'yes'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {detail.contextDiff && detail.contextDiff.length > 0 ? (
        <>
          <h3>Context diff</h3>
          <ul>
            {detail.contextDiff.map((entry) => (
              <li key={entry.contextName}>
                {entry.contextName}:{' '}
                {entry.referenceEqual ? 'unchanged reference' : 'reference changed'}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}
