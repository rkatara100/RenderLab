import { Pool } from 'pg';

let pool: Pool | null = null;

/** Lazily creates a singleton pg Pool from DATABASE_URL. Neon's connection
 * string already handles serverless-friendly pooling (ARCHITECTURE.md §3.5 —
 * no PgBouncer needed at this scale). */
export function getPool(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
