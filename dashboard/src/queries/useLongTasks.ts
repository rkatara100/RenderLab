import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import type { EventPageCursor, LongTaskPage } from '@renderlab/shared-types';
import { apiFetch } from '../lib/api-client';

const LONG_TASKS_PAGE_SIZE = 100;

export function useLongTasks(
  sessionId: string | null,
): UseInfiniteQueryResult<InfiniteData<LongTaskPage>, Error> {
  return useInfiniteQuery({
    queryKey: ['long-tasks', sessionId],
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams({ limit: String(LONG_TASKS_PAGE_SIZE) });
      if (pageParam) {
        searchParams.set('cursorTs', pageParam.ts);
        searchParams.set('cursorId', pageParam.id);
      }
      return apiFetch<LongTaskPage>(
        `/api/sessions/${sessionId}/long-tasks?${searchParams.toString()}`,
      );
    },
    initialPageParam: null as EventPageCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: sessionId !== null,
  });
}
