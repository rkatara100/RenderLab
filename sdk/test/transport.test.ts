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

  it('sends the sdk version and the consumer-supplied app version, never key material', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchSpy);
    await sendBatch([], session, {
      endpoint: 'http://api.test',
      apiKey: 'super-secret-ingest-key',
      mode: 'fetch',
      appVersion: '2.3.1',
    });
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      sdk_version: string;
      session: { app_version: string };
    };
    expect(body.sdk_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(body.session.app_version).toBe('2.3.1');
    expect(JSON.stringify(body)).not.toContain('super-secret-ingest-key');
  });

  it('generates a fresh batch_id per call', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchSpy);
    await sendBatch([], session, { endpoint: 'http://api.test', apiKey: 'key', mode: 'fetch' });
    await sendBatch([], session, { endpoint: 'http://api.test', apiKey: 'key', mode: 'fetch' });
    const first = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      batch_id: string;
    };
    const second = JSON.parse((fetchSpy.mock.calls[1] as [string, RequestInit])[1].body as string) as {
      batch_id: string;
    };
    expect(first.batch_id).not.toBe(second.batch_id);
  });
});
