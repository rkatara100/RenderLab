import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import type { EventPageCursor, RenderReason, RenderTimelinePage } from '@renderlab/shared-types';
import { apiFetch } from '../lib/api-client';

const EVENTS_PAGE_SIZE = 200;

export interface UseSessionEventsOptions {
  avoidableOnly?: boolean;
  search?: string;
  renderReasons?: RenderReason[];
  from?: string;
  to?: string;
}

export function useSessionEvents(
  sessionId: string | null,
  options: UseSessionEventsOptions = {},
): UseInfiniteQueryResult<InfiniteData<RenderTimelinePage>, Error> {
  const { avoidableOnly = false, search = '', renderReasons = [], from, to } = options;

  return useInfiniteQuery({
    queryKey: ['session-events', sessionId, { avoidableOnly, search, renderReasons, from, to }],
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams({ limit: String(EVENTS_PAGE_SIZE) });
      if (avoidableOnly) searchParams.set('avoidableOnly', 'true');
      if (search) searchParams.set('search', search);
      if (renderReasons.length > 0) searchParams.set('renderReason', renderReasons.join(','));
      if (from) searchParams.set('from', from);
      if (to) searchParams.set('to', to);
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
