import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { RenderEvent } from '@renderlab/shared-types';
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

function makeBatchBody(events: RenderEvent[], batchId = 'batch-1') {
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
    // reason codes: mount=1, parent-rerender=5; second row's is_avoidable=true and propsDiff serialized
    expect(insertCall?.params).toEqual(expect.arrayContaining([1, 5, true]));
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
