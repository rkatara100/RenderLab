import { useUIStore } from '../../stores/useUIStore';

/** A persistent banner, not a per-view state — being offline affects every
 * data-fetching view at once, so it's shown once in the shell rather than
 * duplicated in each page's loading/error/empty branch. */
export function OfflineBanner(): React.JSX.Element | null {
  const isOffline = useUIStore((s) => s.isOffline);
  if (!isOffline) return null;

  return (
    <div className="offline-banner" role="status">
      You&rsquo;re offline. Data shown may be stale until your connection is back.
    </div>
  );
}
