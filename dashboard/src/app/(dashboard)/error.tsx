'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error('[RenderLab] unhandled error in dashboard route', error);
  }, [error]);

  return (
    <div className="page">
      <div className="state-panel state-panel--error" role="alert">
        <p className="state-panel__title">Something went wrong</p>
        <p className="state-panel__description">
          This view hit an unexpected error and couldn&rsquo;t render. This has been logged.
        </p>
        <div className="state-panel__actions">
          <button type="button" onClick={reset}>
            Try again
          </button>
          <Link href="/tree">Back to Component Tree</Link>
        </div>
      </div>
    </div>
  );
}
