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

export interface TestRedis extends RedisLike {
  store: Map<string, unknown>;
  advanceTimeBy: (ms: number) => void;
  failNextEval: () => void;
}

export function createTestRedis(): TestRedis {
  const store = new Map<string, unknown>();
  const hashes = new Map<string, Map<string, number>>();
  const expiresAt = new Map<string, number>();

  let now = Date.now();
  let evalShouldFail = false;

  const purgeIfExpired = (key: string): void => {
    const deadline = expiresAt.get(key);
    if (deadline !== undefined && deadline <= now) {
      expiresAt.delete(key);
      store.delete(key);
      hashes.delete(key);
    }
  };

  const ttlSeconds = (key: string): number => {
    const deadline = expiresAt.get(key);
    if (deadline === undefined) return -1;
    return Math.max(0, Math.ceil((deadline - now) / 1000));
  };

  const set: RedisLike['set'] = (key, value, opts) => {
    purgeIfExpired(key);
    if (opts?.nx && store.has(key)) return Promise.resolve(null);
    store.set(key, value);
    if (opts?.ex !== undefined) expiresAt.set(key, now + opts.ex * 1000);
    return Promise.resolve('OK');
  };
  const incrby: RedisLike['incrby'] = (key, amount) => {
    purgeIfExpired(key);
    const next = Number(store.get(key) ?? 0) + amount;
    store.set(key, next);
    return Promise.resolve(next);
  };
  const hincrby: RedisLike['hincrby'] = (key, field, amount) => {
    purgeIfExpired(key);
    const hash = hashes.get(key) ?? new Map<string, number>();
    const next = (hash.get(field) ?? 0) + amount;
    hash.set(field, next);
    hashes.set(key, hash);
    return Promise.resolve(next);
  };
  const hset: RedisLike['hset'] = (key, kv) => {
    purgeIfExpired(key);
    const hash = hashes.get(key) ?? new Map<string, number>();
    for (const [field, value] of Object.entries(kv)) hash.set(field, Number(value));
    hashes.set(key, hash);
    return Promise.resolve(Object.keys(kv).length);
  };
  const expire: RedisLike['expire'] = (key, seconds) => {
    purgeIfExpired(key);
    if (!store.has(key) && !hashes.has(key)) return Promise.resolve(0);
    expiresAt.set(key, now + seconds * 1000);
    return Promise.resolve(1);
  };
  const hgetall: RedisLike['hgetall'] = (key) => {
    purgeIfExpired(key);
    const hash = hashes.get(key);
    if (!hash) return Promise.resolve(null);
    const out: Record<string, string> = {};
    for (const [field, value] of hash) out[field] = String(value);
    return Promise.resolve(out);
  };
  const del: RedisLike['del'] = (...keys) => {
    let count = 0;
    for (const key of keys) {
      expiresAt.delete(key);
      if (hashes.delete(key) || store.delete(key)) count += 1;
    }
    return Promise.resolve(count);
  };

  const evalScript: RedisLike['eval'] = (_script, keys, args) => {
    if (evalShouldFail) {
      evalShouldFail = false;
      return Promise.reject(new Error('redis unavailable'));
    }
    const key = keys[0] ?? '';
    const windowSeconds = Number(args[0] ?? 0);
    purgeIfExpired(key);

    const count = Number(store.get(key) ?? 0) + 1;
    store.set(key, count);
    if (count === 1) expiresAt.set(key, now + windowSeconds * 1000);

    let ttl = ttlSeconds(key);
    if (ttl < 0) {
      expiresAt.set(key, now + windowSeconds * 1000);
      ttl = windowSeconds;
    }
    return Promise.resolve([count, ttl]);
  };

  return {
    store,
    set,
    incrby,
    hincrby,
    hset,
    expire,
    hgetall,
    del,
    eval: evalScript,
    advanceTimeBy: (ms: number) => {
      now += ms;
    },
    failNextEval: () => {
      evalShouldFail = true;
    },
  };
}
