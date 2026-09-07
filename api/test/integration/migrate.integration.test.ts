import { afterAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/db/migrate.js';
import { getIntegrationPool, closeIntegrationPool } from './helpers.js';

describe('runMigrations against a real Postgres instance', () => {
  afterAll(async () => {
    await closeIntegrationPool();
  });

  it('is idempotent: re-running the already-migrated schema applies nothing and does not throw', async () => {
    const pool = getIntegrationPool();
    const applied = await runMigrations(pool);
    expect(applied).toEqual([]);
  });

  it('actually created every column migration 005 renamed/added, not just a string match', async () => {
    const pool = getIntegrationPool();
    const { rows } = await pool.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'projects' AND column_name IN
         ('api_key_hash', 'api_key_prefix', 'dashboard_key_hash', 'dashboard_key_prefix')`,
    );
    const names = rows.map((r) => r.column_name).sort();
    expect(names).toEqual([
      'api_key_hash',
      'api_key_prefix',
      'dashboard_key_hash',
      'dashboard_key_prefix',
    ]);

    const apiKeyHash = rows.find((r) => r.column_name === 'api_key_hash');
    expect(apiKeyHash?.is_nullable).toBe('NO');
  });

  it('created render_events as a table actually partitioned by range on ts', async () => {
    const pool = getIntegrationPool();
    const { rows } = await pool.query<{ partstrat: string }>(
      `SELECT partstrat FROM pg_partitioned_table pt
       JOIN pg_class c ON c.oid = pt.partrelid
       WHERE c.relname = 'render_events'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.partstrat).toBe('r');
  });

  it('recorded every migration file in schema_migrations', async () => {
    const pool = getIntegrationPool();
    const { rows } = await pool.query<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY name',
    );
    expect(rows.map((r) => r.name)).toEqual([
      '001_init.sql',
      '002_render_event_diagnostics.sql',
      '003_perf_events.sql',
      '004_render_event_replay_fields.sql',
      '005_split_ingest_dashboard_keys.sql',
    ]);
  });
});
