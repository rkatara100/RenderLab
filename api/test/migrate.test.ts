import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { createFakePool } from './fakes.js';

/** Simulates just enough of Postgres semantics for the migration runner:
 * tracks applied migration names in memory and executes migration SQL as a
 * no-op (this is a runner-logic test, not a real-schema test). */
function createMigrationAwarePool() {
  const applied: string[] = [];
  return createFakePool((text) => {
    if (text.startsWith('SELECT name FROM schema_migrations')) {
      return { rows: applied.map((name) => ({ name })) };
    }
    if (text.startsWith('INSERT INTO schema_migrations')) {
      // handler doesn't see bound params directly here; recorded via calls instead
      return { rows: [] };
    }
    return { rows: [] };
  });
}

describe('runMigrations', () => {
  it('applies every .sql file in migrations/ on a fresh database, in order', async () => {
    const fake = createMigrationAwarePool();
    const applied = await runMigrations(fake as unknown as Pool);

    expect(applied).toEqual(['001_init.sql', '002_render_event_diagnostics.sql']);
    const insertCalls = fake.calls.filter((c) => c.text.includes('INSERT INTO schema_migrations'));
    expect(insertCalls.map((c) => c.params[0])).toEqual([
      '001_init.sql',
      '002_render_event_diagnostics.sql',
    ]);
    // the actual DDL from each file should have been executed too
    expect(fake.calls.some((c) => c.text.includes('CREATE TABLE IF NOT EXISTS projects'))).toBe(
      true,
    );
    expect(fake.calls.some((c) => c.text.includes('ADD COLUMN IF NOT EXISTS reason_detail'))).toBe(
      true,
    );
  });

  it('is idempotent: re-running against an already-migrated database applies nothing', async () => {
    const fake = createFakePool((text) => {
      if (text.startsWith('SELECT name FROM schema_migrations')) {
        return { rows: [{ name: '001_init.sql' }, { name: '002_render_event_diagnostics.sql' }] };
      }
      return { rows: [] };
    });

    const applied = await runMigrations(fake as unknown as Pool);
    expect(applied).toEqual([]);
    expect(fake.calls.some((c) => c.text.includes('CREATE TABLE IF NOT EXISTS projects'))).toBe(
      false,
    );
  });

  it('applies only the migrations not yet recorded, in order', async () => {
    const fake = createFakePool((text) => {
      if (text.startsWith('SELECT name FROM schema_migrations')) {
        return { rows: [{ name: '001_init.sql' }] };
      }
      return { rows: [] };
    });

    const applied = await runMigrations(fake as unknown as Pool);
    expect(applied).toEqual(['002_render_event_diagnostics.sql']);
    expect(fake.calls.some((c) => c.text.includes('CREATE TABLE IF NOT EXISTS projects'))).toBe(
      false,
    );
    expect(fake.calls.some((c) => c.text.includes('ADD COLUMN IF NOT EXISTS reason_detail'))).toBe(
      true,
    );
  });
});
