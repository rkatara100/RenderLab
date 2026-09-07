export interface AppEnv {
  port: number;
  databaseUrl: string;
  upstashUrl: string;
  upstashToken: string;
  corsOrigins: string[];
  logLevel: string;
  signupRateLimitMax: number;
  signupRateLimitWindowSeconds: number;
  ingestRateLimitMax: number;
  ingestRateLimitWindowSeconds: number;
  readRateLimitMax: number;
  readRateLimitWindowSeconds: number;
  replayRateLimitMax: number;
  replayRateLimitWindowSeconds: number;
  replayEventCap: number;
  retentionDays: number;
  shutdownGraceMs: number;
}

const VALID_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'EnvError';
  }
}

interface Source {
  [key: string]: string | undefined;
}

function requireString(source: Source, key: string, problems: string[]): string {
  const raw = source[key]?.trim();
  if (!raw) {
    problems.push(`${key} is required but was empty or unset`);
    return '';
  }
  return raw;
}

function positiveInt(source: Source, key: string, fallback: number, problems: string[]): number {
  const raw = source[key]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    problems.push(`${key} must be a positive integer, received ${JSON.stringify(raw)}`);
    return fallback;
  }
  return parsed;
}

function parseOrigins(source: Source): string[] {
  const raw = source.CORS_ORIGINS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseLogLevel(source: Source, problems: string[]): string {
  const raw = source.LOG_LEVEL?.trim();
  if (!raw) return 'info';
  if (!VALID_LOG_LEVELS.includes(raw)) {
    problems.push(`LOG_LEVEL must be one of ${VALID_LOG_LEVELS.join('|')}, received ${raw}`);
    return 'info';
  }
  return raw;
}

export function loadEnv(source: Source = process.env): AppEnv {
  const problems: string[] = [];

  const env: AppEnv = {
    port: positiveInt(source, 'PORT', 8787, problems),
    databaseUrl: requireString(source, 'DATABASE_URL', problems),
    upstashUrl: requireString(source, 'UPSTASH_REDIS_REST_URL', problems),
    upstashToken: requireString(source, 'UPSTASH_REDIS_REST_TOKEN', problems),
    corsOrigins: parseOrigins(source),
    logLevel: parseLogLevel(source, problems),
    signupRateLimitMax: positiveInt(source, 'SIGNUP_RATE_LIMIT_MAX', 10, problems),
    signupRateLimitWindowSeconds: positiveInt(
      source,
      'SIGNUP_RATE_LIMIT_WINDOW_SECONDS',
      900,
      problems,
    ),
    ingestRateLimitMax: positiveInt(source, 'INGEST_RATE_LIMIT_MAX', 600, problems),
    ingestRateLimitWindowSeconds: positiveInt(
      source,
      'INGEST_RATE_LIMIT_WINDOW_SECONDS',
      60,
      problems,
    ),
    readRateLimitMax: positiveInt(source, 'READ_RATE_LIMIT_MAX', 120, problems),
    readRateLimitWindowSeconds: positiveInt(source, 'READ_RATE_LIMIT_WINDOW_SECONDS', 60, problems),
    replayRateLimitMax: positiveInt(source, 'REPLAY_RATE_LIMIT_MAX', 30, problems),
    replayRateLimitWindowSeconds: positiveInt(
      source,
      'REPLAY_RATE_LIMIT_WINDOW_SECONDS',
      60,
      problems,
    ),
    replayEventCap: positiveInt(source, 'REPLAY_EVENT_CAP', 2000, problems),
    retentionDays: positiveInt(source, 'RETENTION_DAYS', 7, problems),
    shutdownGraceMs: positiveInt(source, 'SHUTDOWN_GRACE_MS', 15000, problems),
  };

  if (problems.length > 0) throw new EnvError(problems);
  return env;
}

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  cached ??= loadEnv();
  return cached;
}

export function resetEnvForTests(): void {
  cached = null;
}
