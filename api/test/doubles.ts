import type { RedisLike } from '../src/redis/hotPath.js';

export interface QueryCall {
  text: string;
  params: unknown[];
}

export interface TestPool {
  calls: QueryCall[];
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  connect: () => Promise<{ query: TestPool['query']; release: () => void }>;
}

export function createTestPool(
  handler: (text: string, params: unknown[]) => { rows: unknown[] } = () => ({ rows: [] }),
): TestPool {
  const calls: QueryCall[] = [];
  const query: TestPool['query'] = (text, params = []) => {
    calls.push({ text, params });
    return Promise.resolve(handler(text, params));
  };
  return { calls, query, connect: () => Promise.resolve({ query, release: () => {} }) };
}

export function createTestRedis(): RedisLike & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  const hashes = new Map<string, Map<string, number>>();

  const set: RedisLike['set'] = (key, value, opts) => {
    if (opts?.nx && store.has(key)) return Promise.resolve(null);
    store.set(key, value);
    return Promise.resolve('OK');
  };
  const incrby: RedisLike['incrby'] = (key, amount) => {
    const next = Number(store.get(key) ?? 0) + amount;
    store.set(key, next);
    return Promise.resolve(next);
  };
  const hincrby: RedisLike['hincrby'] = (key, field, amount) => {
    const hash = hashes.get(key) ?? new Map<string, number>();
    const next = (hash.get(field) ?? 0) + amount;
    hash.set(field, next);
    hashes.set(key, hash);
    return Promise.resolve(next);
  };
  const hset: RedisLike['hset'] = (key, kv) => {
    const hash = hashes.get(key) ?? new Map<string, number>();
    for (const [field, value] of Object.entries(kv)) hash.set(field, Number(value));
    hashes.set(key, hash);
    return Promise.resolve(Object.keys(kv).length);
  };
  const expire: RedisLike['expire'] = () => Promise.resolve(1);
  const hgetall: RedisLike['hgetall'] = (key) => {
    const hash = hashes.get(key);
    if (!hash) return Promise.resolve(null);
    const out: Record<string, string> = {};
    for (const [field, value] of hash) out[field] = String(value);
    return Promise.resolve(out);
  };
  const del: RedisLike['del'] = (...keys) => {
    let count = 0;
    for (const key of keys) {
      if (hashes.delete(key) || store.delete(key)) count += 1;
    }
    return Promise.resolve(count);
  };

  return { store, set, incrby, hincrby, hset, expire, hgetall, del };
}
