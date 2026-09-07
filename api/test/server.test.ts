import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer } from '../src/server.js';
import { createTestPool, createTestRedis } from './doubles.js';

interface ReadyBody {
  status: string;
  checks: { database: { ok: boolean }; cache: { ok: boolean } };
}

interface ErrorBody {
  error: string;
  requestId: string;
}

function buildTestServer(overrides: { pool?: Pool; redis?: ReturnType<typeof createTestRedis> } = {}) {
  const pool = overrides.pool ?? (createTestPool() as unknown as Pool);
  const redis = overrides.redis ?? createTestRedis();
  return buildServer({ pool, redis });
}

describe('liveness and readiness', () => {
  it('responds to /health without touching dependencies', async () => {
    const app = buildTestServer();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });

    await app.close();
  });

  it('reports ready when postgres and redis both answer', async () => {
    const app = buildTestServer();
    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    const body = response.json<ReadyBody>();
    expect(body.status).toBe('ready');
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.cache.ok).toBe(true);

    await app.close();
  });

  it('returns 503 when postgres is unreachable', async () => {
    const pool = {
      query: () => Promise.reject(new Error('connection refused')),
    } as unknown as Pool;
    const app = buildTestServer({ pool });

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    const body = response.json<ReadyBody>();
    expect(body.status).toBe('degraded');
    expect(body.checks.database.ok).toBe(false);

    await app.close();
  });

  it('returns 503 when redis is unreachable', async () => {
    const redis = createTestRedis();
    redis.incrby = () => Promise.reject(new Error('upstash down'));
    const app = buildTestServer({ redis });

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json<ReadyBody>().checks.cache.ok).toBe(false);

    await app.close();
  });
});

describe('error contract', () => {
  it('does not leak internal error detail on a 500', async () => {
    const app = buildTestServer();
    app.get('/boom', () => {
      throw new Error('relation "projects" does not exist at character 42');
    });

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(500);
    const body = response.json<ErrorBody>();
    expect(body.error).toBe('internal server error');
    expect(JSON.stringify(body)).not.toContain('relation');
    expect(body.requestId).toBeTruthy();

    await app.close();
  });

  it('preserves the message for client errors', async () => {
    const app = buildTestServer();
    app.get('/bad', () => {
      const error = Object.assign(new Error('sessionId must be a valid UUID'), {
        statusCode: 400,
      });
      throw error;
    });

    const response = await app.inject({ method: 'GET', url: '/bad' });

    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorBody>().error).toBe('sessionId must be a valid UUID');

    await app.close();
  });

  it('returns a structured 404 for unknown routes', async () => {
    const app = buildTestServer();
    const response = await app.inject({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorBody>().error).toBe('route not found');

    await app.close();
  });

  it('attaches a distinct request id per request', async () => {
    const app = buildTestServer();
    app.get('/boom', () => {
      throw new Error('kaboom');
    });

    const first = await app.inject({ method: 'GET', url: '/boom' });
    const second = await app.inject({ method: 'GET', url: '/boom' });

    expect(first.json<ErrorBody>().requestId).not.toBe(second.json<ErrorBody>().requestId);

    await app.close();
  });
});
