import { describe, expect, it } from 'vitest';
import {
  findProjectByApiKey,
  getRenderEventDetail,
  insertRenderEvents,
  listRenderEvents,
  listSessionComponents,
  listSessions,
  upsertComponent,
  upsertSession,
} from '../src/db/repository.js';
import { createFakePool } from './fakes.js';
import type { Pool } from 'pg';

describe('findProjectByApiKey', () => {
  it('looks up by key prefix, then compares the full key among candidates', async () => {
    const fake = createFakePool(() => ({
      rows: [{ id: 'p1', api_key: 'abcd1234-real', is_active: true }],
    }));

    const project = await findProjectByApiKey(fake as unknown as Pool, 'abcd1234-real');

    expect(fake.calls[0]?.params).toEqual(['abcd1234']); // first 8 chars
    expect(project).toEqual({ id: 'p1', isActive: true });
  });

  it('returns null when no candidate matches the full key', async () => {
    const fake = createFakePool(() => ({
      rows: [{ id: 'p1', api_key: 'other-key', is_active: true }],
    }));
    const project = await findProjectByApiKey(fake as unknown as Pool, 'abcd1234-real');
    expect(project).toBeNull();
  });
});

describe('upsertSession', () => {
  it('upserts on (project_id, sdk_session_key) and refreshes last_seen_at', async () => {
    const fake = createFakePool(() => ({ rows: [{ id: 'sess-1' }] }));
    const id = await upsertSession(fake as unknown as Pool, {
      projectId: 'p1',
      sdkSessionKey: 'sdk-key-1',
      startedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(id).toBe('sess-1');
    expect(fake.calls[0]?.text).toContain('ON CONFLICT (project_id, sdk_session_key)');
    expect(fake.calls[0]?.params).toEqual([
      'p1',
      'sdk-key-1',
      '2026-01-01T00:00:00.000Z',
      null,
      null,
      null,
    ]);
  });
});

describe('upsertComponent', () => {
  it('dedupes on (project_id, fiber_path_hash), keyed by componentName', async () => {
    const fake = createFakePool(() => ({ rows: [{ id: 42 }] }));
    const id = await upsertComponent(fake as unknown as Pool, 'p1', 'SearchBox');

    expect(id).toBe(42);
    expect(fake.calls[0]?.params).toEqual(['p1', 'SearchBox', 'SearchBox']);
  });
});

describe('insertRenderEvents', () => {
  it('is a no-op for an empty batch', async () => {
    const fake = createFakePool();
    await insertRenderEvents(fake as unknown as Pool, 'p1', []);
    expect(fake.calls).toHaveLength(0);
  });

  it('builds one multi-row INSERT with 10 params per row, in order', async () => {
    const fake = createFakePool();
    await insertRenderEvents(fake as unknown as Pool, 'p1', [
      {
        sessionId: 's1',
        componentId: 1,
        ts: 't1',
        durationMs: 0.5,
        renderReason: 1,
        isAvoidable: false,
        reasonDetail: 'initial mount',
        propsDiff: null,
        contextDiff: null,
      },
      {
        sessionId: 's1',
        componentId: 2,
        ts: 't2',
        durationMs: 1.5,
        renderReason: 5,
        isAvoidable: true,
        reasonDetail: 'not memoized; re-rendered because an ancestor did',
        propsDiff: '[]',
        contextDiff: null,
      },
    ]);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.text).toContain(
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10), ($11, $12, $13, $14, $15, $16, $17, $18, $19, $20)',
    );
    expect(fake.calls[0]?.params).toEqual([
      'p1',
      's1',
      1,
      't1',
      0.5,
      1,
      false,
      'initial mount',
      null,
      null,
      'p1',
      's1',
      2,
      't2',
      1.5,
      5,
      true,
      'not memoized; re-rendered because an ancestor did',
      '[]',
      null,
    ]);
  });
});

describe('listSessions', () => {
  it('orders by started_at DESC and caps the limit at 200', async () => {
    const fake = createFakePool();
    await listSessions(fake as unknown as Pool, 'p1', 10_000);
    const { text, params } = fake.calls[0]!;
    expect(text).toContain('ORDER BY started_at DESC');
    expect(params).toEqual(['p1', 200]);
  });
});

describe('listSessionComponents', () => {
  it('joins rollups to components and scopes by both session and project', async () => {
    const fake = createFakePool();
    await listSessionComponents(fake as unknown as Pool, 'p1', 's1');
    const { text, params } = fake.calls[0]!;
    expect(text).toContain('FROM session_component_rollups');
    expect(text).toContain('JOIN sessions s ON s.id = r.session_id');
    expect(text).toContain('ORDER BY r.render_count DESC');
    expect(params).toEqual(['s1', 'p1']);
  });
});

describe('listRenderEvents', () => {
  it('uses a keyset condition on (ts, id), never OFFSET', async () => {
    const fake = createFakePool();
    await listRenderEvents(fake as unknown as Pool, {
      sessionId: 's1',
      cursor: { ts: '2026-01-01T00:00:00.000Z', id: '100' },
      limit: 50,
    });

    const { text, params } = fake.calls[0]!;
    expect(text).not.toContain('OFFSET');
    expect(text).toContain('(r.ts, r.id) < ($2, $3)');
    expect(text).toContain('ORDER BY r.ts DESC, r.id DESC');
    expect(text).toContain('LIMIT 50');
    expect(text).toContain('JOIN components c ON c.id = r.component_id');
    expect(params).toEqual(['s1', '2026-01-01T00:00:00.000Z', '100']);
  });

  it('caps limit at 500 even if a larger value is requested', async () => {
    const fake = createFakePool();
    await listRenderEvents(fake as unknown as Pool, { sessionId: 's1', limit: 10_000 });
    expect(fake.calls[0]?.text).toContain('LIMIT 500');
  });

  it('applies from/to as ts range predicates before the cursor condition', async () => {
    const fake = createFakePool();
    await listRenderEvents(fake as unknown as Pool, {
      sessionId: 's1',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-02T00:00:00.000Z',
    });
    const { text, params } = fake.calls[0]!;
    expect(text).toContain('r.ts >= $2');
    expect(text).toContain('r.ts < $3');
    expect(params).toEqual(['s1', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z']);
  });

  it('filters to avoidable-only renders via the partial index condition', async () => {
    const fake = createFakePool();
    await listRenderEvents(fake as unknown as Pool, { sessionId: 's1', avoidableOnly: true });
    expect(fake.calls[0]?.text).toContain('r.is_avoidable = true');
  });
});

describe('getRenderEventDetail', () => {
  it('looks up by (session_id, ts, id) — not id alone — to stay indexed under partitioning', async () => {
    const fake = createFakePool(() => ({
      rows: [{ id: '1', reasonDetail: 'props.value changed' }],
    }));
    const detail = await getRenderEventDetail(
      fake as unknown as Pool,
      'p1',
      's1',
      '1',
      '2026-01-01T00:00:00.000Z',
    );

    expect(fake.calls[0]?.text).toContain('r.session_id = $1 AND r.ts = $2 AND r.id = $3');
    expect(fake.calls[0]?.params).toEqual(['s1', '2026-01-01T00:00:00.000Z', '1', 'p1']);
    expect(detail?.reasonDetail).toBe('props.value changed');
  });

  it('returns null when no row matches', async () => {
    const fake = createFakePool();
    const detail = await getRenderEventDetail(
      fake as unknown as Pool,
      'p1',
      's1',
      '404',
      '2026-01-01T00:00:00.000Z',
    );
    expect(detail).toBeNull();
  });
});
