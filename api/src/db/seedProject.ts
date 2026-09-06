import { getPool, closePool } from './pool.js';
import { createProject } from './repository.js';

function parseArgs(argv: string[]): { name: string; email: string } {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg?.startsWith('--')) {
      const value = argv[i + 1];
      if (value !== undefined) args.set(arg.slice(2), value);
    }
  }
  const name = args.get('name');
  const email = args.get('email');
  if (!name || !email) {
    throw new Error('Usage: pnpm run db:seed -- --name "<project name>" --email <owner email>');
  }
  return { name, email };
}

async function main(): Promise<void> {
  const { name, email } = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const project = await createProject(pool, name, email);

  console.log(`Created project ${project.id} ("${name}")`);
  console.log(`Ingest key (give to the SDK):    ${project.ingestKey}`);
  console.log(`Dashboard key (paste in Settings): ${project.dashboardKey}`);

  await closePool();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
