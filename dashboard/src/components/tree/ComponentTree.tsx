import type { ComponentSummary } from '@renderlab/shared-types';
import { EmptyState } from '../shared/EmptyState';

export interface ComponentTreeProps {
  components: ComponentSummary[];
  searchQuery: string;
  showOnlyReRendered: boolean;
  selectedComponentId: number | null;
  onSelect: (componentId: number) => void;
}

/**
 * Renders the session's components as a flat, sortable list rather than a
 * nested tree: Phase 2 dedupes component identity by `componentName` alone,
 * not full ancestor-path position (documented there and in ARCHITECTURE.md
 * §8.8 — the SDK's per-mount instance ids aren't stable across sessions), so
 * there's no reliable parent/child structure to nest by yet. Real tree
 * nesting is a Phase 6/8 follow-up once the SDK sends stable ancestor names.
 */
export function ComponentTree({
  components,
  searchQuery,
  showOnlyReRendered,
  selectedComponentId,
  onSelect,
}: ComponentTreeProps): React.JSX.Element {
  const filtered = components
    .filter((c) => c.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((c) => !showOnlyReRendered || c.renderCount > 1);

  if (filtered.length === 0) {
    return (
      <EmptyState
        title="No components match"
        description={
          components.length === 0
            ? 'This session has no recorded renders yet.'
            : 'Try clearing the search or the "only re-rendered" filter.'
        }
      />
    );
  }

  return (
    <table className="component-tree">
      <thead>
        <tr>
          <th scope="col">Component</th>
          <th scope="col">Renders</th>
          <th scope="col">Avoidable</th>
          <th scope="col">Total ms</th>
          <th scope="col">Max ms</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((c) => (
          <tr
            key={c.componentId}
            className={c.componentId === selectedComponentId ? 'is-selected' : undefined}
            onClick={() => onSelect(c.componentId)}
            aria-selected={c.componentId === selectedComponentId}
          >
            <td>{c.displayName}</td>
            <td>{c.renderCount}</td>
            <td>
              {c.avoidableCount > 0 ? (
                <span className="badge badge--warning">{c.avoidableCount}</span>
              ) : (
                '0'
              )}
            </td>
            <td>{c.totalDurationMs.toFixed(2)}</td>
            <td>{c.maxDurationMs.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
