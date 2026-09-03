import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { RenderEventDetail } from '@renderlab/shared-types';
import { apiFetch } from '../lib/api-client';
import type { SelectedEventRef } from '../stores/useTimelineStore';

export function useRenderEventDetail(
  sessionId: string | null,
  event: SelectedEventRef | null,
): UseQueryResult<RenderEventDetail, Error> {
  return useQuery({
    queryKey: ['render-event-detail', sessionId, event?.id, event?.ts],
    queryFn: async () => {
      const searchParams = new URLSearchParams({ ts: event?.ts ?? '' });
      return apiFetch<RenderEventDetail>(
        `/api/sessions/${sessionId}/events/${event?.id}?${searchParams.toString()}`,
      );
    },
    enabled: sessionId !== null && event !== null,
  });
}
