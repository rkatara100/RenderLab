import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Builds the ingestion service's Fastify instance. Phase 0 scaffolding only:
 * `/health` is the sole route. `POST /api/ingest/events` and
 * `POST /api/ingest/session-end` (ARCHITECTURE.md section 3.4) are Phase 2
 * work — this is where `routes/ingest.ts` will register against this app.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', () => {
    return { status: 'ok' as const };
  });

  return app;
}
