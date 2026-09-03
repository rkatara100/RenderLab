import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { LongTaskEvent, NetworkRequestEvent, RenderEvent, TelemetryEvent } from '@renderlab/shared-types';
import { buildServer } from '../src/server.js';
import { createFakeRedis } from './fakes.js';

const API_KEY = 'test-project-api-key-0001';

function makeFakePool() {
  const calls: { text: string; params: unknown[] }[] = [];
  let componentSeq = 0;

  const query = async (text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    if (text.includes('FROM projects')) {
      return { rows: [{ id: 'proj-1', api_key: API_KEY, is_active: true }] };
    }
    if (text.includes('INSERT INTO sessions')) {
      return { rows: [{ id: 'sess-1' }] };
    }
    if (text.includes('INSERT INTO components')) {
      componentSeq += 1;
      return { rows: [{ id: componentSeq }] };
    }
    return { rows: [] };
  };

  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

function makeRenderEvent(overrides: Partial<RenderEvent> = {}): RenderEvent {
  return {
    type: 'render',
    eventId: 'e1',
    sessionId: 'sdk-sess-1',
    appId: 'app-1',
    timestamp: Date.now(),
    sequence: 1,
    componentId: 'SearchBox#0',
    componentName: 'SearchBox',
    componentPath: ['App', 'SearchBox#0'],
    phase: 'mount',
    renderReason: 'mount',
    propsDiff: [],
    actualDuration: 0.4,
    baseDuration: 0.4,
    startTime: 0,
    commitTime: 1,
    isMemoized: false,
    renderCount: 1,
    ...overrides,
  };
}

function makeLongTaskEvent(overrides: Partial<LongTaskEvent> = {}): LongTaskEvent {
  return {
    type: 'long-task',
    eventId: 'lt1',
    sessionId: 'sdk-sess-1',
    appId: 'app-1',
    timestamp: Date.now(),
    sequence: 1,
    duration: 90,
    attribution: ['script'],
    ...overrides,
  };
}

function makeNetworkRequestEvent(overrides: Partial<NetworkRequestEvent> = {}): NetworkRequestEvent {
  return {
    type: 'network-request',
    eventId: 'nr1',
    sessionId: 'sdk-sess-1',
    appId: 'app-1',
    timestamp: Date.now(),
    sequence: 1,
    url: 'https://api.example.com/data',
    method: 'UNKNOWN',
    duration: 42,
    initiatorType: 'fetch',
    status: 200,
    transferSize: 1200,
    ...overrides,
  };
}

function makeBatchBody(events: TelemetryEvent[], batchId = 'batch-1') {
  return {
    batch_id: batchId,
    session: { sdk_session_key: 'sdk-sess-1', started_at: new Date().toISOString() },
    events,
  };
}

describe('POST /api/ingest/events', () => {
  it('rejects requests without a valid API key', async () => {
    const app = buildServer({ pool: makeFakePool() as unknown as Pool, redis: createFakeRedis() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      payload: makeBatchBody([makeRenderEvent()]),
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a valid batch, inserts render events, and marks the render as avoidable when reason is parent-rerender', async () => {
    const fakePool = makeFakePool();
    const app = buildServer({ pool: fakePool as unknown as Pool, redis: createFakeRedis() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: makeBatchBody([
        makeRenderEvent({ eventId: 'e1', renderReason: 'mount', phase: 'mount' }),
        makeRenderEvent({ eventId: 'e2', renderReason: 'parent-rerender', phase: 'update' }),
      ]),
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ accepted: true, event_count: 2 });

    const insertCall = fakePool.calls.find((c) => c.text.includes('INSERT INTO render_events'));
    expect(insertCall).toBeDefined();

    expect(insertCall?.params).toEqual(expect.arrayContaining([1, 5, true]));
  });

  it('persists reasonDetail and propsDiff for a props-changed render, not just avoidable ones', async () => {
    const fakePool = makeFakePool();
    const app = buildServer({ pool: fakePool as unknown as Pool, redis: createFakeRedis() });
    const propsDiff = [
      {
        key: 'value',
        prevValue: 1,
        nextValue: 2,
        referenceEqual: false,
        shallowEqual: false,
        valueType: 'primitive' as const,
      },
    ];

    await app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: makeBatchBody([
        makeRenderEvent({
          renderReason: 'props-changed',
          phase: 'update',
          reasonDetail: 'props.value changed',
          propsDiff,
        }),
      ]),
    });

    const insertCall = fakePool.calls.find((c) => c.text.includes('INSERT INTO render_events'));
    expect(insertCall?.params).toContain('props.value changed');
    expect(insertCall?.params).toContain(JSON.stringify(propsDiff));
  });

  it('does not persist propsDiff for renders where it has no diagnostic value (state-changed)', async () => {
    const fakePool = makeFakePool();
    const app = buildServer({ pool: fakePool as unknown as Pool, redis: createFakeRedis() });

    await app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: makeBatchBody([makeRenderEvent({ renderReason: 'state-changed', phase: 'update' })]),
    });

    const insertCall = fakePool.calls.find((c) => c.text.includes('INSERT INTO render_events'));

    const nullCount = insertCall?.params.filter((p) => p === null).length ?? 0;
    expect(nullCount).toBeGreaterThanOrEqual(2);
  });

  it('is idempotent: replaying the same batch_id does not insert render events twice', async () => {
    const fakePool = makeFakePool();
    const redis = createFakeRedis();
    const app = buildServer({ pool: fakePool as unknown as Pool, redis });
    const payload = makeBatchBody([makeRenderEvent()], 'batch-dup');

    const first = await app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload,
    });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    const insertCalls = fakePool.calls.filter((c) => c.text.includes('INSERT INTO render_events'));
    expect(insertCalls).toHaveLength(1);
  });

  it('persists long-task and network-request events alongside render events in one batch', async () => {
    const fakePool = makeFakePool();
    const app = buildServer({ pool: fakePool as unknown as Pool, redis: createFakeRedis() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: makeBatchBody([
        makeRenderEvent(),
        makeLongTaskEvent({ duration: 88, attribution: ['layout'] }),
        makeNetworkRequestEvent({ url: 'https://api.example.com/orders', status: 500 }),
      ]),
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ accepted: true, event_count: 3 });

    const longTaskInsert = fakePool.calls.find((c) => c.text.includes('INSERT INTO long_task_events'));
    expect(longTaskInsert?.params).toEqual(expect.arrayContaining([88, ['layout']]));

    const networkInsert = fakePool.calls.find((c) =>
      c.text.includes('INSERT INTO network_request_events'),
    );
    expect(networkInsert?.params).toEqual(
      expect.arrayContaining(['https://api.example.com/orders', 500]),
    );

    expect(fakePool.calls.filter((c) => c.text.includes('INSERT INTO components'))).toHaveLength(1);
  });

  it('rejects a batch larger than the server-side cap with 413', async () => {
    const app = buildServer({ pool: makeFakePool() as unknown as Pool, redis: createFakeRedis() });
    const events = Array.from({ length: 501 }, (_, i) => makeRenderEvent({ eventId: `e${i}` }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: makeBatchBody(events),
    });
    expect(res.statusCode).toBe(413);
  });
});

describe('POST /api/ingest/session-end', () => {
  it('requires a valid API key', async () => {
    const app = buildServer({ pool: makeFakePool() as unknown as Pool, redis: createFakeRedis() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ingest/session-end',
      payload: { sdk_session_key: 'sdk-sess-1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('marks the session ended', async () => {
    const fakePool = makeFakePool();
    const app = buildServer({ pool: fakePool as unknown as Pool, redis: createFakeRedis() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ingest/session-end',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: { sdk_session_key: 'sdk-sess-1' },
    });

    expect(res.statusCode).toBe(202);
    expect(fakePool.calls.some((c) => c.text.includes('UPDATE sessions SET ended_at'))).toBe(true);
  });
});
