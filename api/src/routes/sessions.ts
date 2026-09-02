import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { ComponentSummary, SessionSummary } from '@renderlab/shared-types';
import { authenticateRequest } from '../auth/apiKey.js';
import { listSessionComponents, listSessions } from '../db/repository.js';

/** A session is "live" if it hasn't been explicitly ended and was seen
 * recently — matches the Redis presence TTL window (ARCHITECTURE.md §3.3),
 * so the dashboard's badge and the SDK's own liveness signal agree. */
const LIVE_WINDOW_MS = 60_000;

function isLive(endedAt: string | null, lastSeenAt: string): boolean {
  return endedAt === null && Date.now() - new Date(lastSeenAt).getTime() < LIVE_WINDOW_MS;
}

export interface ReadRouteDeps {
  pool: Pool;
}

/**
 * Read endpoints for the dashboard. Reuses the same project API-key Bearer
 * auth as ingestion (ARCHITECTURE.md §3.5: no separate human login system
 * yet — one project, one key, scoping every read the same way it scopes
 * writes). A real multi-user login is out of scope for this phase.
 */
export function registerReadRoutes(app: FastifyInstance, deps: ReadRouteDeps): void {
  const { pool } = deps;

  app.get('/api/sessions', async (request, reply) => {
    const project = await authenticateRequest(pool, request);
    if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });

    const rows = await listSessions(pool, project.id);
    const sessions: SessionSummary[] = rows.map((r) => ({
      ...r,
      isLive: isLive(r.endedAt, r.lastSeenAt),
    }));
    return reply.send({ sessions });
  });

  app.get<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/components',
    async (request, reply) => {
      const project = await authenticateRequest(pool, request);
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });

      const components: ComponentSummary[] = await listSessionComponents(
        pool,
        project.id,
        request.params.sessionId,
      );
      return reply.send({ components });
    },
  );
}
