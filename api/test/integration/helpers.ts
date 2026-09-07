import { Pool } from 'pg';

let pool: Pool | null = null;

export function getIntegrationPool(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function resetDatabase(): Promise<void> {
  await getIntegrationPool().query('DELETE FROM projects');
}

export async function closeIntegrationPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
