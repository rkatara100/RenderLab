import { useUIStore } from '../../stores/useUIStore';

export function OfflineBanner(): React.JSX.Element | null {
  const isOffline = useUIStore((s) => s.isOffline);
  if (!isOffline) return null;

  return (
    <div className="offline-banner" role="status">
      You&rsquo;re offline. Data shown may be stale until your connection is back.
    </div>
  );
}
