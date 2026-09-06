import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { RenderEvent, TelemetryEvent } from '@renderlab/shared-types';
import { buildServer } from '../src/server.js';
import { redisKeys } from '../src/redis/keys.js';
import { hashApiKey } from '../src/db/repository.js';
import { createTestRedis } from './doubles.js';

const API_KEY = 'test-project-api-key-0001';

interface ErrorBody {
  error: string;
}

function createPool() {
  const query = async (text: string) => {
    if (text.includes('FROM projects')) {
      return { rows: [{ id: 'proj-1', key_hash: hashApiKey(API_KEY), is_active: true }] };
    }
    if (text.includes('INSERT INTO sessions')) return { rows: [{ id: 'sess-1' }] };
    if (text.includes('INSERT INTO components')) return { rows: [{ id: 1 }] };
    return { rows: [] };
  };
  return { query, connect: async () => ({ query, release: () => {} }) };
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

function buildHarness() {
  const redis = createTestRedis();
  const app = buildServer({ pool: createPool() as unknown as Pool, redis });
  return { app, redis };
}

function post(app: ReturnType<typeof buildServer>, events: TelemetryEvent[], batchId = 'batch-1') {
  return app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: { authorization: `Bearer ${API_KEY}` },
    payload: {
      batch_id: batchId,
      session: { sdk_session_key: 'sdk-sess-1', started_at: new Date().toISOString() },
      events,
    },
  });
}

describe('POST /api/ingest/events payload validation', () => {
  it('rejects an unparseable event timestamp with 422 rather than crashing', async () => {
    const { app } = buildHarness();

    const response = await post(app, [
      makeRenderEvent({ timestamp: 'not-a-date' as unknown as number }),
    ]);

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error).toMatch(/timestamp/);

    await app.close();
  });

  it('rejects a NaN duration', async () => {
    const { app } = buildHarness();

    const response = await post(app, [
      makeRenderEvent({ actualDuration: Number.NaN }),
    ]);

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error).toMatch(/actualDuration/);

    await app.close();
  });

  it('rejects a missing componentName', async () => {
    const { app } = buildHarness();

    const response = await post(app, [
      makeRenderEvent({ componentName: '' }),
    ]);

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error).toMatch(/componentName/);

    await app.close();
  });

  it('rejects an unrecognised event type', async () => {
    const { app } = buildHarness();

    const response = await post(app, [
      { type: 'mystery', timestamp: Date.now() } as unknown as TelemetryEvent,
    ]);

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error).toMatch(/not a recognised event type/);

    await app.close();
  });

  it('rejects an invalid session started_at', async () => {
    const { app } = buildHarness();

    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: {
        batch_id: 'batch-x',
        session: { sdk_session_key: 'sdk-sess-1', started_at: 'yesterday-ish' },
        events: [],
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error).toMatch(/started_at/);

    await app.close();
  });

  it('does not consume the idempotency slot when a batch is rejected', async () => {
    const { app, redis } = buildHarness();

    await post(app, [makeRenderEvent({ timestamp: 'garbage' as unknown as number })], 'batch-retry');

    expect(redis.store.has(redisKeys.ingestIdempotency('proj-1', 'batch-retry'))).toBe(false);

    const retry = await post(app, [makeRenderEvent()], 'batch-retry');
    expect(retry.statusCode).toBe(202);

    await app.close();
  });

  it('still accepts a well-formed batch', async () => {
    const { app } = buildHarness();

    const response = await post(app, [makeRenderEvent()]);

    expect(response.statusCode).toBe(202);

    await app.close();
  });
});
