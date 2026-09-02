import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { ComponentSummary, RenderTimelinePage, SessionSummary } from '@renderlab/shared-types';
import { buildServer } from '../src/server.js';
import { createFakeRedis } from './fakes.js';

const API_KEY = 'test-project-api-key-0001';

function makeFakePool(
  overrides: { sessionRows?: unknown[]; componentRows?: unknown[]; eventRows?: unknown[] } = {},
) {
  const calls: { text: string; params: unknown[] }[] = [];
  const query = async (text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    if (text.includes('FROM projects')) {
      return { rows: [{ id: 'proj-1', api_key: API_KEY, is_active: true }] };
    }
    if (text.includes('FROM render_events')) {
      return { rows: overrides.eventRows ?? [] };
    }
    if (text.includes('FROM sessions')) {
      return { rows: overrides.sessionRows ?? [] };
    }
    if (text.includes('FROM session_component_rollups')) {
      return { rows: overrides.componentRows ?? [] };
    }
    return { rows: [] };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

function makeEventRow(
  overrides: Partial<{
    id: string;
    ts: string;
    durationMs: number;
    renderReason: number;
    isAvoidable: boolean;
    componentId: number;
    componentName: string;
  }> = {},
) {
  return {
    id: '1',
    ts: new Date().toISOString(),
    durationMs: 0.5,
    renderReason: 1,
    isAvoidable: false,
    componentId: 1,
    componentName: 'SearchBox',
    ...overrides,
  };
}

describe('GET /api/sessions', () => {
  it('requires a valid API key', async () => {
    const app = buildServer({ pool: makeFakePool() as unknown as Pool, redis: createFakeRedis() });
    const res = await app.inject({ method: 'GET', url: '/api/sessions' });
    expect(res.statusCode).toBe(401);
  });

  it('returns sessions with a derived isLive flag', async () => {
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 120_000).toISOString();
    const pool = makeFakePool({
      sessionRows: [
        {
          id: 's1',
          startedAt: now,
          endedAt: null,
          lastSeenAt: now,
          url: '/app',
          totalRenderCount: 5,
          totalWastedMs: 1.2,
        },
        {
          id: 's2',
          startedAt: stale,
          endedAt: null,
          lastSeenAt: stale,
          url: '/app',
          totalRenderCount: 2,
          totalWastedMs: 0,
        },
      ],
    });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createFakeRedis() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const { sessions } = res.json<{ sessions: SessionSummary[] }>();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.isLive).toBe(true); // seen just now, never ended
    expect(sessions[1]?.isLive).toBe(false); // last seen 2 minutes ago, past the 60s window
  });

  it('returns an empty list rather than an error when the project has no sessions', async () => {
    const app = buildServer({ pool: makeFakePool() as unknown as Pool, redis: createFakeRedis() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sessions: [] });
  });
});

describe('GET /api/sessions/:sessionId/components', () => {
  it('requires a valid API key', async () => {
    const app = buildServer({ pool: makeFakePool() as unknown as Pool, redis: createFakeRedis() });
    const res = await app.inject({ method: 'GET', url: '/api/sessions/s1/components' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the component rollup list for a session', async () => {
    const pool = makeFakePool({
      componentRows: [
        {
          componentId: 1,
          displayName: 'SearchBox',
          fiberPath: 'SearchBox',
          renderCount: 12,
          avoidableCount: 3,
          totalDurationMs: 4.5,
          maxDurationMs: 1.1,
          lastRenderAt: new Date().toISOString(),
        },
      ],
    });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createFakeRedis() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/components',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const { components } = res.json<{ components: ComponentSummary[] }>();
    expect(components).toHaveLength(1);
    expect(components[0]?.displayName).toBe('SearchBox');
  });
});

describe('GET /api/sessions/:sessionId/events', () => {
  it('requires a valid API key', async () => {
    const app = buildServer({ pool: makeFakePool() as unknown as Pool, redis: createFakeRedis() });
    const res = await app.inject({ method: 'GET', url: '/api/sessions/s1/events' });
    expect(res.statusCode).toBe(401);
  });

  it('decodes the numeric render_reason back to the SDK string union', async () => {
    const pool = makeFakePool({ eventRows: [makeEventRow({ renderReason: 5 })] });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createFakeRedis() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/events',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const { events } = res.json<RenderTimelinePage>();
    expect(events[0]?.renderReason).toBe('parent-rerender');
  });

  it('returns nextCursor from the last row only when a full page came back', async () => {
    const full = Array.from({ length: 3 }, (_, i) =>
      makeEventRow({ id: String(i), ts: `2026-01-01T00:00:0${i}.000Z` }),
    );
    const pool = makeFakePool({ eventRows: full });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createFakeRedis() });

    const fullPage = await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/events?limit=3',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    const { nextCursor } = fullPage.json<RenderTimelinePage>();
    expect(nextCursor).toEqual({ ts: '2026-01-01T00:00:02.000Z', id: '2' });

    const partialPage = await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/events?limit=10',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(partialPage.json<RenderTimelinePage>().nextCursor).toBeNull();
  });

  it('forwards cursorTs/cursorId as the keyset cursor', async () => {
    const pool = makeFakePool({ eventRows: [] });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createFakeRedis() });

    await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/events?cursorTs=2026-01-01T00%3A00%3A00.000Z&cursorId=42',
      headers: { authorization: `Bearer ${API_KEY}` },
    });

    const eventsCall = pool.calls.find((c) => c.text.includes('FROM render_events'));
    expect(eventsCall?.params).toContain('2026-01-01T00:00:00.000Z');
    expect(eventsCall?.params).toContain('42');
  });
});
