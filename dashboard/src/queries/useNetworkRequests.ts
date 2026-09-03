import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import type { EventPageCursor, NetworkRequestPage } from '@renderlab/shared-types';
import { apiFetch } from '../lib/api-client';

const NETWORK_REQUESTS_PAGE_SIZE = 100;

export function useNetworkRequests(
  sessionId: string | null,
): UseInfiniteQueryResult<InfiniteData<NetworkRequestPage>, Error> {
  return useInfiniteQuery({
    queryKey: ['network-requests', sessionId],
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams({ limit: String(NETWORK_REQUESTS_PAGE_SIZE) });
      if (pageParam) {
        searchParams.set('cursorTs', pageParam.ts);
        searchParams.set('cursorId', pageParam.id);
      }
      return apiFetch<NetworkRequestPage>(
        `/api/sessions/${sessionId}/network-requests?${searchParams.toString()}`,
      );
    },
    initialPageParam: null as EventPageCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: sessionId !== null,
  });
}
