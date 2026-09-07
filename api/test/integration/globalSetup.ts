import { Pool } from 'pg';
import { runMigrations } from '../../src/db/migrate.js';

export default async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required to run api integration tests against a real Postgres instance.',
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const applied = await runMigrations(pool);
    console.log(
      applied.length > 0
        ? `[integration] applied migrations: ${applied.join(', ')}`
        : '[integration] schema already up to date',
    );
  } finally {
    await pool.end();
  }
}
