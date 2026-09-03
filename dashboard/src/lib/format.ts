
export function formatDurationMs(durationMs: number): string {
  if (durationMs < 1) {
    return `${(durationMs * 1000).toFixed(0)}µs`;
  }
  return `${durationMs.toFixed(2)}ms`;
}
