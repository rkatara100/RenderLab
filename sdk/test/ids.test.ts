import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId, resolveAppId } from '../src/capture/ids.js';

describe('createId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a UUID when crypto.randomUUID is available', () => {
    const id = createId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('falls back to a random hex id when crypto.randomUUID throws (non-secure context)', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new DOMException('randomUUID requires a secure context');
      },
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i += 1) arr[i] = i;
        return arr;
      },
    });

    expect(() => createId()).not.toThrow();
    expect(createId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('falls back when crypto is entirely undefined', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => createId()).not.toThrow();
    expect(createId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('never produces the same id twice under the fallback path', () => {
    vi.stubGlobal('crypto', undefined);
    const a = createId();
    const b = createId();
    expect(a).not.toBe(b);
  });
});

describe('resolveAppId', () => {
  it('uses the configured appId when provided', () => {
    expect(resolveAppId('my-app')).toBe('my-app');
  });

  it('never derives an id from secret key material', () => {
    const id = resolveAppId(undefined);
    expect(id).not.toMatch(/^rl_/);
  });

  it('falls back to the page hostname when no config is provided', () => {
    expect(resolveAppId(undefined)).toBe(location.hostname);
  });
});
