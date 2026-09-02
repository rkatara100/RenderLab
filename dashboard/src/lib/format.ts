/**
 * Formats a render duration for display, e.g. in the timeline (Phase 4) and
 * why-did-it-render panel (Phase 5). Kept here now — rather than deferred —
 * because it's a pure, easily-testable piece of the eventual UI and a
 * reasonable smoke test for the dashboard package's toolchain.
 */
export function formatDurationMs(durationMs: number): string {
  if (durationMs < 1) {
    return `${(durationMs * 1000).toFixed(0)}µs`;
  }
  return `${durationMs.toFixed(2)}ms`;
}
