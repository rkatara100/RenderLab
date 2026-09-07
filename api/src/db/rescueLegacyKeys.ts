import { getPool, closePool } from './pool.js';
import { rotateProjectKeys } from './repository.js';

interface LegacyProjectRow {
  id: string;
  name: string;
  owner_email: string;
}

async function main(): Promise<void> {
  const pool = getPool();

  const { rows } = await pool.query<LegacyProjectRow>(
    `SELECT id, name, owner_email FROM projects WHERE dashboard_key_hash IS NULL`,
  );

  if (rows.length === 0) {
    console.log('No legacy projects found (every project already has a dashboard key).');
    await closePool();
    return;
  }

  console.log(
    `Found ${rows.length} project(s) with no dashboard key — these predate the ` +
      `ingest/dashboard key split and have been unusable since migration 005. Their old ` +
      `plaintext keys cannot be recovered; each is being issued a fresh key pair below. ` +
      `Relay these to the project owner out of band — they are shown once.\n`,
  );

  for (const row of rows) {
    const rotated = await rotateProjectKeys(pool, row.id);
    console.log(`Project ${rotated.id} ("${row.name}", owner: ${row.owner_email})`);
    console.log(`  Ingest key (give to the SDK):      ${rotated.ingestKey}`);
    console.log(`  Dashboard key (paste in Settings):  ${rotated.dashboardKey}\n`);
  }

  await closePool();
}

main().catch((error: unknown) => {
  console.error('rescueLegacyKeys failed:', error);
  process.exit(1);
});
