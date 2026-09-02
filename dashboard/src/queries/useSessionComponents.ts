import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ComponentSummary } from '@renderlab/shared-types';
import { apiFetch } from '../lib/api-client';

export function useSessionComponents(
  sessionId: string | null,
): UseQueryResult<ComponentSummary[], Error> {
  return useQuery({
    queryKey: ['session-components', sessionId],
    queryFn: async () =>
      (await apiFetch<{ components: ComponentSummary[] }>(`/api/sessions/${sessionId}/components`))
        .components,
    enabled: sessionId !== null,
  });
}
