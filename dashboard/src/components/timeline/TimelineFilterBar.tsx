import type { RenderReason } from '@renderlab/shared-types';
import { useFilterStore, type TimeRangePreset } from '../../stores/useFilterStore';

const RENDER_REASONS: RenderReason[] = [
  'mount',
  'props-changed',
  'context-changed',
  'state-changed',
  'parent-rerender',
  'unknown',
];

const TIME_RANGE_OPTIONS: { value: TimeRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '5m', label: 'Last 5 minutes' },
  { value: '15m', label: 'Last 15 minutes' },
  { value: '1h', label: 'Last hour' },
];

export function TimelineFilterBar(): React.JSX.Element {
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const renderReasonFilter = useFilterStore((s) => s.renderReasonFilter);
  const timeRangePreset = useFilterStore((s) => s.timeRangePreset);
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery);
  const toggleRenderReason = useFilterStore((s) => s.toggleRenderReason);
  const setTimeRangePreset = useFilterStore((s) => s.setTimeRangePreset);

  return (
    <div className="toolbar" role="group" aria-label="Timeline filters">
      <input
        type="search"
        placeholder="Search component name…"
        aria-label="Search component name"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <fieldset>
        <legend>Render reason</legend>
        {RENDER_REASONS.map((reason) => (
          <label key={reason}>
            <input
              type="checkbox"
              checked={renderReasonFilter.includes(reason)}
              onChange={() => toggleRenderReason(reason)}
            />
            {reason}
          </label>
        ))}
      </fieldset>

      <select
        aria-label="Time range"
        value={timeRangePreset}
        onChange={(e) => setTimeRangePreset(e.target.value as TimeRangePreset)}
      >
        {TIME_RANGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
