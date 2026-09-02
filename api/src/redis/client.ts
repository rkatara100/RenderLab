import { Redis } from '@upstash/redis';

let client: Redis | null = null;

/** Upstash's REST client — no persistent connection, no true pub/sub
 * (ARCHITECTURE.md §3.3). Lazily created so importing this module doesn't
 * require env vars to be set (e.g. during typecheck/lint). */
export function getRedis(): Redis {
  client ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL ?? '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  });
  return client;
}
