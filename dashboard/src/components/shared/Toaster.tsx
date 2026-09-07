'use client';

import { useEffect } from 'react';
import { useUIStore } from '../../stores/useUIStore';

const AUTO_DISMISS_MS = 5000;

export function Toaster(): React.JSX.Element | null {
  const toast = useUIStore((s) => s.toast);
  const dismissToast = useUIStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div className="toaster" role="status" aria-live="polite">
      <div className={`toast toast--${toast.variant}`}>
        <p>{toast.message}</p>
        <button type="button" onClick={dismissToast} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
