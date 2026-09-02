import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

describe('ingestion service (Phase 0 scaffold)', () => {
  it('responds to /health', async () => {
    const app = buildServer();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });

    await app.close();
  });
});
