import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { getPool } from './db/pool.js';
import { getRedis } from './redis/client.js';
import { getEnv, type AppEnv } from './config/env.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerReadRoutes } from './routes/sessions.js';
import type { RedisLike } from './redis/hotPath.js';

export interface ServerDeps {
  pool?: Pool;
  redis?: RedisLike;
  env?: AppEnv;
}

interface DependencyStatus {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

async function probe(run: () => Promise<unknown>): Promise<DependencyStatus> {
  const startedAt = Date.now();
  try {
    await run();
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

export function buildServer(deps: ServerDeps = {}): FastifyInstance {
  const env = deps.env ?? getEnv();

  const app = Fastify({
    logger: {
      level: env.logLevel,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'body.apiKey',
          'body.ingestKey',
          'body.dashboardKey',
        ],
        censor: '[redacted]',
      },
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            remoteAddress: request.ip,
          };
        },
      },
    },
    genReqId: () => randomUUID(),
    trustProxy: (_address, hop) => hop === 0,
  });

  const pool = deps.pool ?? getPool();
  const redis = deps.redis ?? getRedis();

  void app.register(cors, { origin: env.corsOrigins.length > 0 ? env.corsOrigins : false });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      request.log.error(
        { err: error, reqId: request.id, route: request.routeOptions?.url },
        'request failed',
      );
      return reply.code(statusCode).send({
        error: 'internal server error',
        requestId: request.id,
      });
    }

    request.log.warn(
      { err: error, reqId: request.id, statusCode },
      'request rejected',
    );
    return reply.code(statusCode).send({
      error: error.message,
      requestId: request.id,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ error: 'route not found', requestId: request.id });
  });

  app.get('/health', () => {
    return { status: 'ok' as const };
  });

  app.get('/ready', async (_request, reply) => {
    const [database, cache] = await Promise.all([
      probe(() => pool.query('SELECT 1')),
      probe(() => redis.incrby('rl:readiness:probe', 0)),
    ]);

    const ready = database.ok && cache.ok;
    return reply.code(ready ? 200 : 503).send({
      status: ready ? ('ready' as const) : ('degraded' as const),
      checks: { database, cache },
    });
  });

  registerIngestRoutes(app, { pool, redis });
  registerProjectRoutes(app, { pool, redis });
  registerReadRoutes(app, { pool, redis });

  return app;
}
