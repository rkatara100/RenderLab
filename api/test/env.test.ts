import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const REQUIRED = {
  DATABASE_URL: 'postgres://u:p@h/db',
  UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'token',
};

describe('loadEnv', () => {
  it('applies documented defaults when optional values are absent', () => {
    const env = loadEnv({ ...REQUIRED });

    expect(env.port).toBe(8787);
    expect(env.readRateLimitMax).toBe(120);
    expect(env.replayEventCap).toBe(2000);
    expect(env.retentionDays).toBe(7);
    expect(env.logLevel).toBe('info');
    expect(env.corsOrigins).toEqual([]);
  });

  it('rejects a non-numeric rate limit rather than silently producing NaN', () => {
    expect(() => loadEnv({ ...REQUIRED, READ_RATE_LIMIT_MAX: 'onehundred' })).toThrow(
      /READ_RATE_LIMIT_MAX must be a positive integer/,
    );
  });

  it('rejects zero and negative limits', () => {
    expect(() => loadEnv({ ...REQUIRED, INGEST_RATE_LIMIT_MAX: '0' })).toThrow(
      /INGEST_RATE_LIMIT_MAX/,
    );
    expect(() => loadEnv({ ...REQUIRED, SIGNUP_RATE_LIMIT_MAX: '-5' })).toThrow(
      /SIGNUP_RATE_LIMIT_MAX/,
    );
  });

  it('reports every missing required credential at once', () => {
    let message = '';
    try {
      loadEnv({});
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('UPSTASH_REDIS_REST_URL');
    expect(message).toContain('UPSTASH_REDIS_REST_TOKEN');
  });

  it('treats a whitespace-only credential as missing', () => {
    expect(() => loadEnv({ ...REQUIRED, DATABASE_URL: '   ' })).toThrow(/DATABASE_URL is required/);
  });

  it('parses and trims a comma-separated cors list', () => {
    const env = loadEnv({ ...REQUIRED, CORS_ORIGINS: 'https://a.dev, https://b.dev ,' });
    expect(env.corsOrigins).toEqual(['https://a.dev', 'https://b.dev']);
  });

  it('rejects an unknown log level', () => {
    expect(() => loadEnv({ ...REQUIRED, LOG_LEVEL: 'chatty' })).toThrow(/LOG_LEVEL must be one of/);
  });
});
