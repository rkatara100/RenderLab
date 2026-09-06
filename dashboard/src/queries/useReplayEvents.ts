import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ReplayEventsResponse } from '@renderlab/shared-types';
import { apiFetch } from '../lib/api-client';

export function useReplayEvents(sessionId: string | null): UseQueryResult<ReplayEventsResponse, Error> {
  return useQuery({
    queryKey: ['replay-events', sessionId],
    queryFn: async () => apiFetch<ReplayEventsResponse>(`/api/sessions/${sessionId}/replay`),
    enabled: sessionId !== null,
  });
}
