import { getPool, closePool } from './pool.js';
import { runMigrations } from './migrate.js';
import { ensureDailyPartition } from './partitions.js';

async function main(): Promise<void> {
  const pool = getPool();
  const applied = await runMigrations(pool);
  console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Already up to date.');
  await ensureDailyPartition(pool);
  console.log("Ensured today's render_events partition exists.");
  await closePool();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
