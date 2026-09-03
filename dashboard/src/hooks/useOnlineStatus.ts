import { useEffect } from 'react';
import { useUIStore } from '../stores/useUIStore';

export function useOnlineStatus(): void {
  const setOffline = useUIStore((s) => s.setOffline);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const handleOnline = (): void => setOffline(false);
    const handleOffline = (): void => setOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOffline]);
}
