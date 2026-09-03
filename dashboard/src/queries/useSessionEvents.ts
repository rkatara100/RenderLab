import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import type { EventPageCursor, RenderTimelinePage } from '@renderlab/shared-types';
import { apiFetch } from '../lib/api-client';

const EVENTS_PAGE_SIZE = 200;

export interface UseSessionEventsOptions {
  avoidableOnly?: boolean;
}

export function useSessionEvents(
  sessionId: string | null,
  options: UseSessionEventsOptions = {},
): UseInfiniteQueryResult<InfiniteData<RenderTimelinePage>, Error> {
  const { avoidableOnly = false } = options;

  return useInfiniteQuery({
    queryKey: ['session-events', sessionId, { avoidableOnly }],
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams({ limit: String(EVENTS_PAGE_SIZE) });
      if (avoidableOnly) searchParams.set('avoidableOnly', 'true');
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
