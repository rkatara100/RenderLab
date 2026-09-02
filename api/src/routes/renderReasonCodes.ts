import type { RenderReason } from '@renderlab/shared-types';

/** Matches the `render_events.render_reason` column comment in
 * migrations/001_init.sql / ARCHITECTURE.md §3.1. */
const CODES: Record<RenderReason, number> = {
  mount: 1,
  'props-changed': 2,
  'state-changed': 3,
  'context-changed': 4,
  'parent-rerender': 5,
  unknown: 6,
};

export function renderReasonToCode(reason: RenderReason): number {
  return CODES[reason];
}

/**
 * A render counts as "avoidable" — the definition behind
 * `is_avoidable`/`avoidable_count`/`total_wasted_ms` — when it fired purely
 * because an ancestor re-rendered and this component wasn't memoized
 * (renderReason `'parent-rerender'`, which the SDK's heuristic only assigns
 * when `isMemoized` is false — see renderReason.ts rule 5). Wrapping the
 * component in `React.memo` would very likely have prevented it.
 */
export function isAvoidableRender(reason: RenderReason): boolean {
  return reason === 'parent-rerender';
}
