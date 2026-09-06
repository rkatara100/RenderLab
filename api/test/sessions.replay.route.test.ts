import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { ReplayEventsResponse } from '@renderlab/shared-types';
import { buildServer } from '../src/server.js';
import { redisKeys } from '../src/redis/keys.js';
import { hashApiKey } from '../src/db/repository.js';
import { createTestRedis } from './doubles.js';

const API_KEY = 'test-project-api-key-0001';

function createPool(eventRows: unknown[] = []) {
  const calls: { text: string; params: unknown[] }[] = [];
  const query = async (text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    if (text.includes('FROM projects')) {
      return { rows: [{ id: 'proj-1', key_hash: hashApiKey(API_KEY), is_active: true }] };
    }
    if (text.includes('FROM render_events')) {
      return { rows: eventRows };
    }
    return { rows: [] };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

function makeReplayRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '1',
    ts: new Date().toISOString(),
    durationMs: 0.5,
    renderReason: 1,
    isAvoidable: false,
    componentId: 1,
    componentName: 'SearchBox',
    phase: 1,
    commitTime: 10.5,
    componentPath: ['App#0', 'SearchBox#0'],
    ...overrides,
  };
}

describe('GET /api/sessions/:sessionId/replay', () => {
  it('requires a valid API key', async () => {
    const app = buildServer({ pool: createPool() as unknown as Pool, redis: createTestRedis() });
    const res = await app.inject({ method: 'GET', url: '/api/sessions/11111111-1111-1111-1111-111111111111/replay' });
    expect(res.statusCode).toBe(401);
  });

  it('returns events in ascending order with decoded phase and componentPath', async () => {
    const pool = createPool([makeReplayRow()]);
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/11111111-1111-1111-1111-111111111111/replay',
      headers: { authorization: `Bearer ${API_KEY}` },
    });

    expect(res.statusCode).toBe(200);
    const body: ReplayEventsResponse = res.json();
    expect(body.truncated).toBe(false);
    expect(body.events).toEqual([
      expect.objectContaining({
        phase: 'mount',
        componentPath: ['App#0', 'SearchBox#0'],
        commitTime: 10.5,
      }),
    ]);

    const call = pool.calls.find((c) => c.text.includes('FROM render_events'));
    expect(call?.text).toContain('ORDER BY r.ts ASC, r.id ASC');
  });

  it('marks truncated: true when the query returns more than the cap', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => makeReplayRow({ id: String(i) }));
    const pool = createPool(rows);
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/11111111-1111-1111-1111-111111111111/replay',
      headers: { authorization: `Bearer ${API_KEY}` },
    });

    const body: ReplayEventsResponse = res.json();
    expect(body.truncated).toBe(true);
    expect(body.events).toHaveLength(2000);
  });

  it('rate-limits a project once it exceeds its per-minute replay budget (default: 30/min)', async () => {
    const redis = createTestRedis();
    redis.store.set(redisKeys.rateLimitReplay('proj-1'), 30);
    const pool = createPool([makeReplayRow()]);
    const app = buildServer({ pool: pool as unknown as Pool, redis });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/11111111-1111-1111-1111-111111111111/replay',
      headers: { authorization: `Bearer ${API_KEY}` },
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});
