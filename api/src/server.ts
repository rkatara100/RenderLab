import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Pool } from 'pg';
import { getPool } from './db/pool.js';
import { getRedis } from './redis/client.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { registerReadRoutes } from './routes/sessions.js';
import type { RedisLike } from './redis/hotPath.js';

export interface ServerDeps {
  pool?: Pool;
  redis?: RedisLike;
}

/**
 * Builds the ingestion + read API's Fastify instance. Accepts `pool`/`redis`
 * so tests can inject fakes instead of hitting real infra (ARCHITECTURE.md
 * §3.4/§3.3) — production boot (`index.ts`) calls this with no args and gets
 * the real singletons. CORS is open (`origin: true`) since the dashboard is
 * a separate origin calling this service directly with its own API key —
 * tightening this to an allowlisted dashboard origin is a pre-launch item,
 * not a Phase 3 concern.
 */
export function buildServer(deps: ServerDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const pool = deps.pool ?? getPool();
  const redis = deps.redis ?? getRedis();

  void app.register(cors, { origin: true });

  app.get('/health', () => {
    return { status: 'ok' as const };
  });

  registerIngestRoutes(app, { pool, redis });
  registerReadRoutes(app, { pool });

  return app;
}
