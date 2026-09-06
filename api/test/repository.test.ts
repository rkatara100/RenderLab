import { describe, expect, it } from 'vitest';
import {
  findProjectByApiKey,
  getRenderEventDetail,
  insertLongTaskEvents,
  insertNetworkRequestEvents,
  insertRenderEvents,
  listLongTaskEvents,
  listNetworkRequestEvents,
  listRenderEvents,
  listReplayEvents,
  listSessionComponents,
  listSessions,
  upsertComponent,
  upsertSession,
} from '../src/db/repository.js';
import { createTestPool } from './doubles.js';
import type { Pool } from 'pg';

describe('findProjectByApiKey', () => {
  it('looks up by key prefix, then compares the full key among candidates', async () => {
    const pool = createTestPool(() => ({
      rows: [{ id: 'p1', api_key: 'abcd1234-real', is_active: true }],
    }));

    const project = await findProjectByApiKey(pool as unknown as Pool, 'abcd1234-real');

    expect(pool.calls[0]?.params).toEqual(['abcd1234']);
    expect(project).toEqual({ id: 'p1', isActive: true });
  });

  it('returns null when no candidate matches the full key', async () => {
    const pool = createTestPool(() => ({
      rows: [{ id: 'p1', api_key: 'other-key', is_active: true }],
    }));
    const project = await findProjectByApiKey(pool as unknown as Pool, 'abcd1234-real');
    expect(project).toBeNull();
  });
});

describe('upsertSession', () => {
  it('upserts on (project_id, sdk_session_key) and refreshes last_seen_at', async () => {
    const pool = createTestPool(() => ({ rows: [{ id: 'sess-1' }] }));
    const id = await upsertSession(pool as unknown as Pool, {
      projectId: 'p1',
      sdkSessionKey: 'sdk-key-1',
      startedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(id).toBe('sess-1');
    expect(pool.calls[0]?.text).toContain('ON CONFLICT (project_id, sdk_session_key)');
    expect(pool.calls[0]?.params).toEqual([
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
    const pool = createTestPool(() => ({ rows: [{ id: 42 }] }));
    const id = await upsertComponent(pool as unknown as Pool, 'p1', 'SearchBox');

    expect(id).toBe(42);
    expect(pool.calls[0]?.params).toEqual(['p1', 'SearchBox', 'SearchBox']);
  });
});

describe('insertRenderEvents', () => {
  it('is a no-op for an empty batch', async () => {
    const pool = createTestPool();
    await insertRenderEvents(pool as unknown as Pool, 'p1', []);
    expect(pool.calls).toHaveLength(0);
  });

  it('builds one multi-row INSERT with 13 params per row, in order', async () => {
    const pool = createTestPool();
    await insertRenderEvents(pool as unknown as Pool, 'p1', [
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
        phase: 1,
        componentPath: ['App#0', 'SearchBox#0'],
        commitTime: 10.5,
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
        phase: 2,
        componentPath: ['App#0', 'List#0'],
        commitTime: 20.25,
      },
    ]);

    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0]?.text).toContain(
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13), ' +
        '($14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)',
    );
    expect(pool.calls[0]?.params).toEqual([
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
      1,
      ['App#0', 'SearchBox#0'],
      10.5,
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
      2,
      ['App#0', 'List#0'],
      20.25,
    ]);
  });
});

describe('listSessions', () => {
  it('orders by started_at DESC and caps the limit at 200', async () => {
    const pool = createTestPool();
    await listSessions(pool as unknown as Pool, 'p1', 10_000);
    const { text, params } = pool.calls[0]!;
    expect(text).toContain('ORDER BY started_at DESC');
    expect(params).toEqual(['p1', 200]);
  });
});

describe('listSessionComponents', () => {
  it('joins rollups to components and scopes by both session and project', async () => {
    const pool = createTestPool();
    await listSessionComponents(pool as unknown as Pool, 'p1', 's1');
    const { text, params } = pool.calls[0]!;
    expect(text).toContain('FROM session_component_rollups');
    expect(text).toContain('JOIN sessions s ON s.id = r.session_id');
    expect(text).toContain('ORDER BY r.render_count DESC');
    expect(params).toEqual(['s1', 'p1']);
  });
});

describe('listRenderEvents', () => {
  it('uses a keyset condition on (ts, id), never OFFSET', async () => {
    const pool = createTestPool();
    await listRenderEvents(pool as unknown as Pool, {
      sessionId: 's1',
      cursor: { ts: '2026-01-01T00:00:00.000Z', id: '100' },
      limit: 50,
    });

    const { text, params } = pool.calls[0]!;
    expect(text).not.toContain('OFFSET');
    expect(text).toContain('(r.ts, r.id) < ($2, $3)');
    expect(text).toContain('ORDER BY r.ts DESC, r.id DESC');
    expect(text).toContain('LIMIT 50');
    expect(text).toContain('JOIN components c ON c.id = r.component_id');
    expect(params).toEqual(['s1', '2026-01-01T00:00:00.000Z', '100']);
  });

  it('caps limit at 500 even if a larger value is requested', async () => {
    const pool = createTestPool();
    await listRenderEvents(pool as unknown as Pool, { sessionId: 's1', limit: 10_000 });
    expect(pool.calls[0]?.text).toContain('LIMIT 500');
  });

  it('applies from/to as ts range predicates before the cursor condition', async () => {
    const pool = createTestPool();
    await listRenderEvents(pool as unknown as Pool, {
      sessionId: 's1',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-02T00:00:00.000Z',
    });
    const { text, params } = pool.calls[0]!;
    expect(text).toContain('r.ts >= $2');
    expect(text).toContain('r.ts < $3');
    expect(params).toEqual(['s1', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z']);
  });

  it('filters to avoidable-only renders via the partial index condition', async () => {
    const pool = createTestPool();
    await listRenderEvents(pool as unknown as Pool, { sessionId: 's1', avoidableOnly: true });
    expect(pool.calls[0]?.text).toContain('r.is_avoidable = true');
  });
});

describe('listReplayEvents', () => {
  it('orders ascending by (ts, id), never DESC, no cursor support', async () => {
    const pool = createTestPool();
    await listReplayEvents(pool as unknown as Pool, { sessionId: 's1', limit: 2001 });

    const { text, params } = pool.calls[0]!;
    expect(text).toContain('ORDER BY r.ts ASC, r.id ASC');
    expect(text).not.toContain('OFFSET');
    expect(text).not.toContain('DESC');
    expect(text).toContain('JOIN components c ON c.id = r.component_id');
    expect(params).toEqual(['s1', 2001]);
  });

  it('selects phase, componentPath, and commitTime alongside the existing columns', async () => {
    const pool = createTestPool(() => ({
      rows: [
        {
          id: '1',
          ts: '2026-01-01T00:00:00.000Z',
          durationMs: 0.5,
          renderReason: 1,
          isAvoidable: false,
          componentId: 1,
          componentName: 'SearchBox',
          phase: 1,
          commitTime: 10.5,
          componentPath: ['App#0', 'SearchBox#0'],
        },
      ],
    }));
    const rows = await listReplayEvents(pool as unknown as Pool, { sessionId: 's1', limit: 2001 });

    expect(pool.calls[0]?.text).toContain('r.phase');
    expect(pool.calls[0]?.text).toContain('r.commit_time AS "commitTime"');
    expect(pool.calls[0]?.text).toContain('r.component_path AS "componentPath"');
    expect(rows[0]).toMatchObject({
      phase: 1,
      commitTime: 10.5,
      componentPath: ['App#0', 'SearchBox#0'],
    });
  });

  it('passes limit straight through with no server-side cap', async () => {
    const pool = createTestPool();
    await listReplayEvents(pool as unknown as Pool, { sessionId: 's1', limit: 2001 });
    expect(pool.calls[0]?.params).toEqual(['s1', 2001]);
  });
});

describe('insertLongTaskEvents', () => {
  it('is a no-op for an empty batch', async () => {
    const pool = createTestPool();
    await insertLongTaskEvents(pool as unknown as Pool, 'p1', []);
    expect(pool.calls).toHaveLength(0);
  });

  it('builds one multi-row INSERT with 5 params per row, in order', async () => {
    const pool = createTestPool();
    await insertLongTaskEvents(pool as unknown as Pool, 'p1', [
      { sessionId: 's1', ts: 't1', durationMs: 75, attribution: ['script'] },
    ]);

    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0]?.text).toContain('INSERT INTO long_task_events');
    expect(pool.calls[0]?.text).toContain('VALUES ($1, $2, $3, $4, $5)');
    expect(pool.calls[0]?.params).toEqual(['p1', 's1', 't1', 75, ['script']]);
  });
});

describe('insertNetworkRequestEvents', () => {
  it('is a no-op for an empty batch', async () => {
    const pool = createTestPool();
    await insertNetworkRequestEvents(pool as unknown as Pool, 'p1', []);
    expect(pool.calls).toHaveLength(0);
  });

  it('builds one multi-row INSERT with 9 params per row, in order', async () => {
    const pool = createTestPool();
    await insertNetworkRequestEvents(pool as unknown as Pool, 'p1', [
      {
        sessionId: 's1',
        ts: 't1',
        url: 'https://api.example.com/data',
        method: 'UNKNOWN',
        status: 200,
        durationMs: 42,
        initiatorType: 'fetch',
        transferSize: 1200,
      },
    ]);

    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0]?.text).toContain('INSERT INTO network_request_events');
    expect(pool.calls[0]?.text).toContain('VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)');
    expect(pool.calls[0]?.params).toEqual([
      'p1',
      's1',
      't1',
      'https://api.example.com/data',
      'UNKNOWN',
      200,
      42,
      'fetch',
      1200,
    ]);
  });
});

describe('listLongTaskEvents', () => {
  it('uses a keyset condition on (ts, id), then batches component correlation in a second query', async () => {
    const pool = createTestPool((text) => {
      if (text.includes('FROM long_task_events')) {
        return { rows: [{ id: '1', ts: '2026-01-01T00:00:00.000Z', durationMs: 80, attribution: [] }] };
      }
      if (text.includes('UNNEST')) {
        return { rows: [{ taskId: '1', componentNames: ['SearchBox'] }] };
      }
      return { rows: [] };
    });

    const tasks = await listLongTaskEvents(pool as unknown as Pool, {
      sessionId: 's1',
      cursor: { ts: '2026-01-01T00:00:00.000Z', id: '100' },
      limit: 50,
    });

    expect(pool.calls).toHaveLength(2);
    expect(pool.calls[0]?.text).not.toContain('OFFSET');
    expect(pool.calls[0]?.text).toContain('(ts, id) < ($2, $3)');
    expect(pool.calls[1]?.text).toContain('JOIN render_events r');
    expect(pool.calls[1]?.params).toEqual(['s1', ['1'], ['2026-01-01T00:00:00.000Z'], [80]]);
    expect(tasks).toEqual([
      {
        id: '1',
        ts: '2026-01-01T00:00:00.000Z',
        durationMs: 80,
        attribution: [],
        correlatedComponentNames: ['SearchBox'],
      },
    ]);
  });

  it('skips the correlation query entirely when the page is empty', async () => {
    const pool = createTestPool(() => ({ rows: [] }));
    const tasks = await listLongTaskEvents(pool as unknown as Pool, { sessionId: 's1' });
    expect(tasks).toEqual([]);
    expect(pool.calls).toHaveLength(1);
  });

  it('caps limit at 500 even if a larger value is requested', async () => {
    const pool = createTestPool();
    await listLongTaskEvents(pool as unknown as Pool, { sessionId: 's1', limit: 10_000 });
    expect(pool.calls[0]?.text).toContain('LIMIT 500');
  });
});

describe('listNetworkRequestEvents', () => {
  it('uses a keyset condition on (ts, id), never OFFSET', async () => {
    const pool = createTestPool();
    await listNetworkRequestEvents(pool as unknown as Pool, {
      sessionId: 's1',
      cursor: { ts: '2026-01-01T00:00:00.000Z', id: '100' },
      limit: 50,
    });

    const { text, params } = pool.calls[0]!;
    expect(text).not.toContain('OFFSET');
    expect(text).toContain('(ts, id) < ($2, $3)');
    expect(text).toContain('ORDER BY ts DESC, id DESC');
    expect(text).toContain('LIMIT 50');
    expect(params).toEqual(['s1', '2026-01-01T00:00:00.000Z', '100']);
  });

  it('caps limit at 500 even if a larger value is requested', async () => {
    const pool = createTestPool();
    await listNetworkRequestEvents(pool as unknown as Pool, { sessionId: 's1', limit: 10_000 });
    expect(pool.calls[0]?.text).toContain('LIMIT 500');
  });
});

describe('getRenderEventDetail', () => {
  it('looks up by (session_id, ts, id) — not id alone — to stay indexed under partitioning', async () => {
    const pool = createTestPool(() => ({
      rows: [{ id: '1', reasonDetail: 'props.value changed' }],
    }));
    const detail = await getRenderEventDetail(
      pool as unknown as Pool,
      'p1',
      's1',
      '1',
      '2026-01-01T00:00:00.000Z',
    );

    expect(pool.calls[0]?.text).toContain('r.session_id = $1 AND r.ts = $2 AND r.id = $3');
    expect(pool.calls[0]?.params).toEqual(['s1', '2026-01-01T00:00:00.000Z', '1', 'p1']);
    expect(detail?.reasonDetail).toBe('props.value changed');
  });

  it('returns null when no row matches', async () => {
    const pool = createTestPool();
    const detail = await getRenderEventDetail(
      pool as unknown as Pool,
      'p1',
      's1',
      '404',
      '2026-01-01T00:00:00.000Z',
    );
    expect(detail).toBeNull();
  });
});
