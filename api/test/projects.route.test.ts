import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { createTestPool, createTestRedis } from './doubles.js';

function makeApp() {
  const pool = createTestPool((text) =>
    text.includes('INSERT INTO projects') ? { rows: [{ id: 'proj-1' }] } : { rows: [] },
  );
  const redis = createTestRedis();
  const app = buildServer({ pool: pool as never, redis });
  return { app, pool, redis };
}

describe('POST /api/projects', () => {
  it('creates a project and returns its id and API key', async () => {
    const { app, pool } = makeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'My App', email: 'owner@example.com' },
    });

    expect(response.statusCode).toBe(201);
    const body: { id: string; apiKey: string } = response.json();
    expect(body.id).toBe('proj-1');
    expect(body.apiKey).toMatch(/^rl_[0-9a-f]{48}$/);

    const insertCall = pool.calls.find((call) => call.text.includes('INSERT INTO projects'));
    expect(insertCall?.params[0]).toBe('My App');
    expect(insertCall?.params[3]).toBe('owner@example.com');

    await app.close();
  });

  it('rejects a missing name', async () => {
    const { app } = makeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { email: 'owner@example.com' },
    });

    expect(response.statusCode).toBe(422);
    await app.close();
  });

  it('rejects a missing or malformed email', async () => {
    const { app } = makeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'My App', email: 'not-an-email' },
    });

    expect(response.statusCode).toBe(422);
    await app.close();
  });

  it('rejects an over-long name', async () => {
    const { app } = makeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'a'.repeat(201), email: 'owner@example.com' },
    });

    expect(response.statusCode).toBe(422);
    await app.close();
  });

  it('rate-limits repeated signups from the same IP (default: 10/15min)', async () => {
    const { app } = makeApp();
    const payload = { name: 'My App', email: 'owner@example.com' };

    for (let i = 0; i < 10; i += 1) {
      const response = await app.inject({ method: 'POST', url: '/api/projects', payload });
      expect(response.statusCode).toBe(201);
    }

    const limited = await app.inject({ method: 'POST', url: '/api/projects', payload });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();

    await app.close();
  });

  it('tracks signup rate limits per IP, not globally', async () => {
    const { app } = makeApp();
    const payload = { name: 'My App', email: 'owner@example.com' };

    for (let i = 0; i < 10; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/projects',
        payload,
        remoteAddress: '10.0.0.1',
      });
    }

    const otherIp = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload,
      remoteAddress: '10.0.0.2',
    });
    expect(otherIp.statusCode).toBe(201);

    await app.close();
  });
});
