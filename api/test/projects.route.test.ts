import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { createFakePool } from './fakes.js';

function makeApp() {
  const pool = createFakePool((text) =>
    text.includes('INSERT INTO projects') ? { rows: [{ id: 'proj-1' }] } : { rows: [] },
  );
  const app = buildServer({ pool: pool as never });
  return { app, pool };
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
});
