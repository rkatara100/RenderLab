import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { SessionSummary } from '@renderlab/shared-types';
import { apiFetch } from '../lib/api-client';

export function useSessions(): UseQueryResult<SessionSummary[], Error> {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => (await apiFetch<{ sessions: SessionSummary[] }>('/api/sessions')).sessions,
  });
}
