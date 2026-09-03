import { randomBytes } from 'node:crypto';
import { getPool, closePool } from './pool.js';

function makeApiKey(): string {
  return `rl_${randomBytes(24).toString('hex')}`;
}

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
  const apiKey = makeApiKey();
  const apiKeyPrefix = apiKey.slice(0, 8);

  const pool = getPool();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO projects (name, api_key, api_key_prefix, owner_email)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [name, apiKey, apiKeyPrefix, email],
  );

  console.log(`Created project ${rows[0]?.id ?? '(unknown id)'} ("${name}")`);
  console.log(`API key: ${apiKey}`);

  await closePool();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
