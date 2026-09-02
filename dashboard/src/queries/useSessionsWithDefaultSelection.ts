import { useEffect } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { SessionSummary } from '@renderlab/shared-types';
import { useSessions } from './useSessions';
import { useSessionSelectionStore } from '../stores/useSessionSelectionStore';

/** Shared by the tree and timeline views: fetches sessions and, once they
 * load, defaults the shared session selection to the most recent one if
 * nothing is selected yet. */
export function useSessionsWithDefaultSelection(): UseQueryResult<SessionSummary[], Error> {
  const sessionsQuery = useSessions();
  const selectedSessionId = useSessionSelectionStore((state) => state.selectedSessionId);
  const selectSession = useSessionSelectionStore((state) => state.selectSession);

  useEffect(() => {
    if (!selectedSessionId && sessionsQuery.data && sessionsQuery.data.length > 0) {
      selectSession(sessionsQuery.data[0]?.id ?? null);
    }
  }, [sessionsQuery.data, selectedSessionId, selectSession]);

  return sessionsQuery;
}
