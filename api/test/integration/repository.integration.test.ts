import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  createProject,
  rotateProjectKeys,
  findProjectByApiKey,
  upsertSession,
  upsertComponent,
  insertRenderEvents,
  listRenderEvents,
  getRenderEventDetail,
  type RenderEventRow,
} from '../../src/db/repository.js';
import { getIntegrationPool, resetDatabase, closeIntegrationPool } from './helpers.js';

describe('repository against a real Postgres instance', () => {
  afterEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await closeIntegrationPool();
  });

  it('round-trips a real sha256 hash comparison for both key scopes', async () => {
    const pool = getIntegrationPool();
    const project = await createProject(pool, 'Integration Test', 'owner@example.com');

    const byIngest = await findProjectByApiKey(pool, project.ingestKey, 'ingest');
    expect(byIngest).toEqual({ id: project.id, isActive: true });

    const byDashboard = await findProjectByApiKey(pool, project.dashboardKey, 'dashboard');
    expect(byDashboard).toEqual({ id: project.id, isActive: true });

    expect(await findProjectByApiKey(pool, project.ingestKey, 'dashboard')).toBeNull();
    expect(await findProjectByApiKey(pool, project.dashboardKey, 'ingest')).toBeNull();
    expect(await findProjectByApiKey(pool, 'rl_totally_wrong_key_value', 'ingest')).toBeNull();
  });

  it('rotation invalidates the old keys and activates the new ones immediately', async () => {
    const pool = getIntegrationPool();
    const project = await createProject(pool, 'Rotate Me', 'owner@example.com');
    const rotated = await rotateProjectKeys(pool, project.id);

    expect(rotated.id).toBe(project.id);
    expect(rotated.ingestKey).not.toBe(project.ingestKey);
    expect(rotated.dashboardKey).not.toBe(project.dashboardKey);

    expect(await findProjectByApiKey(pool, project.ingestKey, 'ingest')).toBeNull();
    expect(await findProjectByApiKey(pool, project.dashboardKey, 'dashboard')).toBeNull();
    expect(await findProjectByApiKey(pool, rotated.ingestKey, 'ingest')).toEqual({
      id: project.id,
      isActive: true,
    });
  });

  it('self-heals a render_events insert into a date with no existing partition', async () => {
    const pool = getIntegrationPool();
    const project = await createProject(pool, 'Partition Test', 'owner@example.com');
    const sessionId = await upsertSession(pool, {
      projectId: project.id,
      sdkSessionKey: 'sess-1',
      startedAt: new Date().toISOString(),
    });
    const componentId = await upsertComponent(pool, project.id, 'SearchBox');

    const farFutureDate = '2099-06-15';
    const row: RenderEventRow = {
      sessionId,
      componentId,
      ts: `${farFutureDate}T12:00:00.000Z`,
      durationMs: 4.2,
      renderReason: 1,
      isAvoidable: false,
      reasonDetail: null,
      propsDiff: null,
      contextDiff: null,
      phase: 1,
      componentPath: ['App', 'SearchBox#0'],
      commitTime: 123.4,
    };

    await expect(insertRenderEvents(pool, project.id, [row])).resolves.toBeUndefined();

    const { rows: partitionRows } = await pool.query<{ exists: string | null }>(
      'SELECT to_regclass($1) AS exists',
      [`render_events_${farFutureDate.replaceAll('-', '_')}`],
    );
    expect(partitionRows[0]?.exists).not.toBeNull();

    const events = await listRenderEvents(pool, {
      sessionId,
      projectId: project.id,
      from: `${farFutureDate}T00:00:00.000Z`,
      to: '2099-06-16T00:00:00.000Z',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.componentName).toBe('SearchBox');
  });

  it('round-trips propsDiff/contextDiff through real jsonb columns without double-encoding', async () => {
    const pool = getIntegrationPool();
    const project = await createProject(pool, 'JSONB Test', 'owner@example.com');
    const sessionId = await upsertSession(pool, {
      projectId: project.id,
      sdkSessionKey: 'sess-2',
      startedAt: new Date().toISOString(),
    });
    const componentId = await upsertComponent(pool, project.id, 'Widget');

    const ts = new Date().toISOString();
    const propsDiff = [{ key: 'value', prevValue: 1, nextValue: 2, shallowEqual: false }];
    const contextDiff = [{ contextName: 'Theme', referenceEqual: false }];

    await insertRenderEvents(pool, project.id, [
      {
        sessionId,
        componentId,
        ts,
        durationMs: 1.1,
        renderReason: 2,
        isAvoidable: false,
        reasonDetail: 'value changed',
        propsDiff: JSON.stringify(propsDiff),
        contextDiff: JSON.stringify(contextDiff),
        phase: 2,
        componentPath: ['Widget#0'],
        commitTime: 5,
      },
    ]);

    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM render_events WHERE session_id = $1',
      [sessionId],
    );
    const eventId = rows[0]?.id;
    expect(eventId).toBeDefined();

    const detail = await getRenderEventDetail(pool, project.id, sessionId, eventId!, ts);
    expect(detail?.propsDiff).toEqual(propsDiff);
    expect(detail?.contextDiff).toEqual(contextDiff);
    expect(typeof detail?.propsDiff).toBe('object');
  });

  it('scopes listRenderEvents to the project a session actually belongs to', async () => {
    const pool = getIntegrationPool();
    const projectA = await createProject(pool, 'Tenant A', 'a@example.com');
    const projectB = await createProject(pool, 'Tenant B', 'b@example.com');

    const sessionId = await upsertSession(pool, {
      projectId: projectA.id,
      sdkSessionKey: 'sess-cross-tenant',
      startedAt: new Date().toISOString(),
    });
    const componentId = await upsertComponent(pool, projectA.id, 'Secret');
    await insertRenderEvents(pool, projectA.id, [
      {
        sessionId,
        componentId,
        ts: new Date().toISOString(),
        durationMs: 1,
        renderReason: 1,
        isAvoidable: false,
        reasonDetail: null,
        propsDiff: null,
        contextDiff: null,
        phase: 1,
        componentPath: ['Secret#0'],
        commitTime: 1,
      },
    ]);

    const crossTenantRead = await listRenderEvents(pool, {
      sessionId,
      projectId: projectB.id,
    });
    expect(crossTenantRead).toEqual([]);

    const sameTenantRead = await listRenderEvents(pool, {
      sessionId,
      projectId: projectA.id,
    });
    expect(sameTenantRead).toHaveLength(1);
  });
});
