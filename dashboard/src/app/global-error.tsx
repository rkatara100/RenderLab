'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error('[RenderLab] unhandled error at the root layout', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ padding: '3rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
          <h1>RenderLab hit an unexpected error</h1>
          <p>This has been logged. Try reloading the page.</p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
