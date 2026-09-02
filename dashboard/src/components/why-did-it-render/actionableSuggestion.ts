import type { RenderReason } from '@renderlab/shared-types';

/**
 * The "act on it" half of Phase 5's brief — each rule from the SDK's
 * heuristic (sdk/src/instrumentation/renderReason.ts) gets a concrete next
 * step, not just a label. `reasonDetail` (from the SDK) already names *what*
 * changed; this adds *what to do about it*.
 */
export function getActionableSuggestion(reason: RenderReason, componentName: string): string {
  switch (reason) {
    case 'mount':
      return 'Initial mount — not a re-render, nothing to act on.';
    case 'props-changed':
      return `Expected if the changed prop is meant to update. If not, check where it's created — a new object/array/function literal on every parent render (e.g. inline "style={{}}" or an arrow function prop) changes by reference even when the value is logically the same.`;
    case 'context-changed':
      return `A consumed context value changed. If ${componentName} only needs part of that context, splitting the context or reading a memoized selector avoids re-rendering it for unrelated changes.`;
    case 'state-changed':
      return 'Local state changed — expected behavior for this component.';
    case 'parent-rerender':
      return `${componentName} isn't memoized. Wrapping it in React.memo() would very likely prevent this render when its own props haven't changed.`;
    case 'unknown':
      return `No tracked signal explains this render — likely an external store update. Wrap ${componentName} with useRenderLabState or useTrackedContext for precise attribution.`;
    default:
      return 'No suggestion available for this render reason.';
  }
}
