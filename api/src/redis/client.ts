import { Redis } from '@upstash/redis';

let client: Redis | null = null;

export function getRedis(): Redis {
  client ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL ?? '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  });
  return client;
}
