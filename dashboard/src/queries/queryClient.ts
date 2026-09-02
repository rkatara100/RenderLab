import { QueryClient } from '@tanstack/react-query';

/** One QueryClient per browser tab, created lazily inside AppProviders
 * (`useState(() => createQueryClient())`) rather than as a module-level
 * singleton — avoids state leaking across requests if this ever runs
 * server-side, and is the documented React Query + Next.js App Router
 * pattern. `retry: 1` (not React Query's default 3) so a genuinely broken
 * API key or unreachable API surfaces an ErrorState quickly instead of
 * silently retrying for several seconds first. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: 1,
      },
    },
  });
}
