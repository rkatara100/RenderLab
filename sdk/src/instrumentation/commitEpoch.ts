let epoch = 0;
let scheduled = false;

/**
 * Only needed by the non-Profiler hook path (`useRenderLabProfiler`), which
 * times itself via `performance.now()` in a `useLayoutEffect` rather than
 * React's own commit timestamp — so two sibling components in the same
 * commit would otherwise read two slightly different timestamps and never
 * group together for the parent-rerender rule. All `useLayoutEffect`
 * callbacks for one commit run synchronously back-to-back; this epoch only
 * advances in a microtask scheduled *after* that synchronous run, so every
 * call within the same commit observes the same epoch value.
 */
export function currentCommitEpoch(): number {
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      epoch += 1;
    });
  }
  return epoch;
}
