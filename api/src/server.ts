import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { getPool } from './db/pool.js';
import { getRedis } from './redis/client.js';
import { registerIngestRoutes } from './routes/ingest.js';
import type { RedisLike } from './redis/hotPath.js';

export interface ServerDeps {
  pool?: Pool;
  redis?: RedisLike;
}

/**
 * Builds the ingestion service's Fastify instance. Accepts `pool`/`redis` so
 * tests can inject fakes instead of hitting real infra (ARCHITECTURE.md
 * §3.4/§3.3) — production boot (`index.ts`) calls this with no args and gets
 * the real singletons.
 */
export function buildServer(deps: ServerDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const pool = deps.pool ?? getPool();
  const redis = deps.redis ?? getRedis();

  app.get('/health', () => {
    return { status: 'ok' as const };
  });

  registerIngestRoutes(app, { pool, redis });

  return app;
}
