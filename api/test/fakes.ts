import type { RedisLike } from '../src/redis/hotPath.js';

export interface FakeQuery {
  text: string;
  params: unknown[];
}

export interface FakePool {
  calls: FakeQuery[];
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  connect: () => Promise<{ query: FakePool['query']; release: () => void }>;
}

/** A pg `Pool`-shaped fake: records every query and lets each test decide
 * what comes back via `handler`, without spinning up real Postgres. */
export function createFakePool(
  handler: (text: string, params: unknown[]) => { rows: unknown[] } = () => ({ rows: [] }),
): FakePool {
  const calls: FakeQuery[] = [];
  const query: FakePool['query'] = (text, params = []) => {
    calls.push({ text, params });
    return Promise.resolve(handler(text, params));
  };
  return { calls, query, connect: () => Promise.resolve({ query, release: () => {} }) };
}

/** An in-memory `RedisLike` fake — real hash/counter semantics, no network. */
export function createFakeRedis(): RedisLike & { store: Map<string, unknown> } {
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

  return { store, set, incrby, hincrby, expire, hgetall, del };
}
