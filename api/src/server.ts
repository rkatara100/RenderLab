import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Pool } from 'pg';
import { getPool } from './db/pool.js';
import { getRedis } from './redis/client.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerReadRoutes } from './routes/sessions.js';
import type { RedisLike } from './redis/hotPath.js';

export interface ServerDeps {
  pool?: Pool;
  redis?: RedisLike;
}

function corsOrigin(): boolean | string[] {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) return true;
  const list = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return list.length > 0 ? list : true;
}

export function buildServer(deps: ServerDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: true });
  const pool = deps.pool ?? getPool();
  const redis = deps.redis ?? getRedis();

  void app.register(cors, { origin: corsOrigin() });

  app.get('/health', () => {
    return { status: 'ok' as const };
  });

  registerIngestRoutes(app, { pool, redis });
  registerProjectRoutes(app, { pool, redis });
  registerReadRoutes(app, { pool, redis });

  return app;
}
