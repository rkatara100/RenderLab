import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendBatch, type SessionRef } from '../src/capture/transport.js';

const session: SessionRef = { sessionId: 's1', startedAt: Date.now() };

describe('sendBatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves when the ingest endpoint responds ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202 }));
    await expect(
      sendBatch([], session, { endpoint: 'http://api.test', apiKey: 'key', mode: 'fetch' }),
    ).resolves.toBeUndefined();
  });

  it('rejects when the ingest endpoint responds with a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(
      sendBatch([], session, { endpoint: 'http://api.test', apiKey: 'key', mode: 'fetch' }),
    ).rejects.toThrow(/500/);
  });

  it('sends the API key as a Bearer token', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchSpy);
    await sendBatch([], session, { endpoint: 'http://api.test', apiKey: 'secret-key', mode: 'fetch' });
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');
  });

  it('resolves via sendBeacon when mode is beacon and the browser accepts it', async () => {
    const beaconSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon: beaconSpy });
    await expect(
      sendBatch([], session, { endpoint: 'http://api.test', apiKey: 'key', mode: 'beacon' }),
    ).resolves.toBeUndefined();
    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects when sendBeacon is rejected by the browser', async () => {
    vi.stubGlobal('navigator', { sendBeacon: vi.fn().mockReturnValue(false) });
    await expect(
      sendBatch([], session, { endpoint: 'http://api.test', apiKey: 'key', mode: 'beacon' }),
    ).rejects.toThrow(/sendBeacon/);
  });
});
