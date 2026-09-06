import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type {
  ComponentSummary,
  LongTaskPage,
  NetworkRequestPage,
  RenderEventDetail,
  RenderTimelinePage,
  SessionSummary,
} from '@renderlab/shared-types';
import { buildServer } from '../src/server.js';
import { createTestRedis } from './doubles.js';

const API_KEY = 'test-project-api-key-0001';

function createPool(
  overrides: {
    sessionRows?: unknown[];
    componentRows?: unknown[];
    eventRows?: unknown[];
    eventDetailRow?: unknown;
    longTaskRows?: unknown[];
    correlationRows?: unknown[];
    networkRequestRows?: unknown[];
  } = {},
) {
  const calls: { text: string; params: unknown[] }[] = [];
  const query = async (text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    if (text.includes('FROM projects')) {
      return { rows: [{ id: 'proj-1', api_key: API_KEY, is_active: true }] };
    }

    if (text.includes('r.ts = $2 AND r.id = $3')) {
      const row = overrides.eventDetailRow;
      return { rows: row === undefined ? [] : row === null ? [] : [row] };
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
    if (text.includes('UNNEST')) {
      return { rows: overrides.correlationRows ?? [] };
    }
    if (text.includes('FROM long_task_events')) {
      return { rows: overrides.longTaskRows ?? [] };
    }
    if (text.includes('FROM network_request_events')) {
      return { rows: overrides.networkRequestRows ?? [] };
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
    const app = buildServer({ pool: createPool() as unknown as Pool, redis: createTestRedis() });
    const res = await app.inject({ method: 'GET', url: '/api/sessions' });
    expect(res.statusCode).toBe(401);
  });

  it('returns sessions with a derived isLive flag', async () => {
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 120_000).toISOString();
    const pool = createPool({
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
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const { sessions } = res.json<{ sessions: SessionSummary[] }>();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.isLive).toBe(true);
    expect(sessions[1]?.isLive).toBe(false);
  });

  it('returns an empty list rather than an error when the project has no sessions', async () => {
    const app = buildServer({ pool: createPool() as unknown as Pool, redis: createTestRedis() });
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
    const app = buildServer({ pool: createPool() as unknown as Pool, redis: createTestRedis() });
    const res = await app.inject({ method: 'GET', url: '/api/sessions/s1/components' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the component rollup list for a session', async () => {
    const pool = createPool({
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
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

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
    const app = buildServer({ pool: createPool() as unknown as Pool, redis: createTestRedis() });
    const res = await app.inject({ method: 'GET', url: '/api/sessions/s1/events' });
    expect(res.statusCode).toBe(401);
  });

  it('decodes the numeric render_reason back to the SDK string union', async () => {
    const pool = createPool({ eventRows: [makeEventRow({ renderReason: 5 })] });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

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
    const pool = createPool({ eventRows: full });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

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
    const pool = createPool({ eventRows: [] });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

    await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/events?cursorTs=2026-01-01T00%3A00%3A00.000Z&cursorId=42',
      headers: { authorization: `Bearer ${API_KEY}` },
    });

    const eventsCall = pool.calls.find((c) => c.text.includes('FROM render_events'));
    expect(eventsCall?.params).toContain('2026-01-01T00:00:00.000Z');
    expect(eventsCall?.params).toContain('42');
  });

  it('forwards avoidableOnly=true to the partial-index filter', async () => {
    const pool = createPool({ eventRows: [] });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

    await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/events?avoidableOnly=true',
      headers: { authorization: `Bearer ${API_KEY}` },
    });

    const eventsCall = pool.calls.find((c) => c.text.includes('FROM render_events'));
    expect(eventsCall?.text).toContain('r.is_avoidable = true');
  });
});

describe('GET /api/sessions/:sessionId/events/:eventId', () => {
  it('requires a valid API key', async () => {
    const app = buildServer({ pool: createPool() as unknown as Pool, redis: createTestRedis() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/events/1?ts=2026-01-01T00:00:00.000Z',
    });
    expect(res.statusCode).toBe(401);
  });

  it('requires the ts query parameter', async () => {
    const app = buildServer({ pool: createPool() as unknown as Pool, redis: createTestRedis() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/events/1',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 404 when the event does not exist for that session', async () => {
    const pool = createPool({ eventDetailRow: null });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/events/999?ts=2026-01-01T00:00:00.000Z',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('decodes render_reason and parses the JSON diff payloads', async () => {
    const pool = createPool({
      eventDetailRow: {
        id: '1',
        ts: '2026-01-01T00:00:00.000Z',
        durationMs: 0.8,
        renderReason: 2,
        isAvoidable: false,
        componentId: 1,
        componentName: 'SearchBox',
        reasonDetail: 'props.value changed',
        propsDiff: JSON.stringify([
          {
            key: 'value',
            prevValue: 1,
            nextValue: 2,
            referenceEqual: false,
            shallowEqual: false,
            valueType: 'primitive',
          },
        ]),
        contextDiff: null,
      },
    });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/events/1?ts=2026-01-01T00:00:00.000Z',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const detail = res.json<RenderEventDetail>();
    expect(detail.renderReason).toBe('props-changed');
    expect(detail.reasonDetail).toBe('props.value changed');
    expect(detail.propsDiff).toEqual([
      {
        key: 'value',
        prevValue: 1,
        nextValue: 2,
        referenceEqual: false,
        shallowEqual: false,
        valueType: 'primitive',
      },
    ]);
    expect(detail.contextDiff).toBeNull();
  });
});

describe('GET /api/sessions/:sessionId/long-tasks', () => {
  it('requires a valid API key', async () => {
    const app = buildServer({ pool: createPool() as unknown as Pool, redis: createTestRedis() });
    const res = await app.inject({ method: 'GET', url: '/api/sessions/s1/long-tasks' });
    expect(res.statusCode).toBe(401);
  });

  it('returns tasks with server-computed correlatedComponentNames', async () => {
    const pool = createPool({
      longTaskRows: [
        { id: '1', ts: '2026-01-01T00:00:00.000Z', durationMs: 90, attribution: ['script'] },
      ],
      correlationRows: [{ taskId: '1', componentNames: ['SearchBox', 'ResultsList'] }],
    });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/long-tasks',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const { tasks } = res.json<LongTaskPage>();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.correlatedComponentNames).toEqual(['SearchBox', 'ResultsList']);
  });

  it('returns nextCursor from the last row only when a full page came back', async () => {
    const full = Array.from({ length: 3 }, (_, i) => ({
      id: String(i),
      ts: `2026-01-01T00:00:0${i}.000Z`,
      durationMs: 60,
      attribution: [],
    }));
    const pool = createPool({ longTaskRows: full });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/long-tasks?limit=3',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    const { nextCursor } = res.json<LongTaskPage>();
    expect(nextCursor).toEqual({ ts: '2026-01-01T00:00:02.000Z', id: '2' });
  });
});

describe('GET /api/sessions/:sessionId/network-requests', () => {
  it('requires a valid API key', async () => {
    const app = buildServer({ pool: createPool() as unknown as Pool, redis: createTestRedis() });
    const res = await app.inject({ method: 'GET', url: '/api/sessions/s1/network-requests' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the network request list for a session', async () => {
    const pool = createPool({
      networkRequestRows: [
        {
          id: '1',
          ts: '2026-01-01T00:00:00.000Z',
          url: 'https://api.example.com/orders',
          method: 'UNKNOWN',
          status: 500,
          durationMs: 120,
          initiatorType: 'fetch',
          transferSize: 340,
        },
      ],
    });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/network-requests',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const { requests } = res.json<NetworkRequestPage>();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.status).toBe(500);
    expect(requests[0]?.url).toBe('https://api.example.com/orders');
  });

  it('forwards cursorTs/cursorId as the keyset cursor', async () => {
    const pool = createPool({ networkRequestRows: [] });
    const app = buildServer({ pool: pool as unknown as Pool, redis: createTestRedis() });

    await app.inject({
      method: 'GET',
      url: '/api/sessions/s1/network-requests?cursorTs=2026-01-01T00%3A00%3A00.000Z&cursorId=42',
      headers: { authorization: `Bearer ${API_KEY}` },
    });

    const call = pool.calls.find((c) => c.text.includes('FROM network_request_events'));
    expect(call?.params).toContain('2026-01-01T00:00:00.000Z');
    expect(call?.params).toContain('42');
  });
});
