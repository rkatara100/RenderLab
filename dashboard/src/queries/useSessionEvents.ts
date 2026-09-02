import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import type { EventPageCursor, RenderTimelinePage } from '@renderlab/shared-types';
import { apiFetch } from '../lib/api-client';

const EVENTS_PAGE_SIZE = 200;

/**
 * One page per keyset-cursor request (ARCHITECTURE.md §3.2/§4) — pages
 * accumulate in React Query's cache as the user scrolls, and `Timeline.tsx`
 * flattens+virtualizes them. The server bounds each request's cost; the
 * client bounds DOM cost via virtualization (see Timeline.tsx's perf note),
 * so neither side does unbounded work as a session's event count grows.
 */
export function useSessionEvents(
  sessionId: string | null,
): UseInfiniteQueryResult<InfiniteData<RenderTimelinePage>, Error> {
  return useInfiniteQuery({
    queryKey: ['session-events', sessionId],
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams({ limit: String(EVENTS_PAGE_SIZE) });
      if (pageParam) {
        searchParams.set('cursorTs', pageParam.ts);
        searchParams.set('cursorId', pageParam.id);
      }
      return apiFetch<RenderTimelinePage>(
        `/api/sessions/${sessionId}/events?${searchParams.toString()}`,
      );
    },
    initialPageParam: null as EventPageCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: sessionId !== null,
  });
}
