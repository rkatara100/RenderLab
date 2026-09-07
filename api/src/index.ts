import { buildServer } from './server.js';
import { getPool, closePool } from './db/pool.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { getEnv, type AppEnv } from './config/env.js';

function fail(message: string, error: unknown): never {
  console.error(message, error instanceof Error ? error.message : error);
  process.exit(1);
}

function loadEnvOrExit(): AppEnv {
  try {
    return getEnv();
  } catch (error) {
    fail('Startup aborted.', error);
  }
}

const env = loadEnvOrExit();

const app = buildServer({ env });
const pool = getPool();

startScheduler(pool, { retentionDays: env.retentionDays, logger: app.log });

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  app.log.info({ signal }, 'shutdown started');

  const timer = setTimeout(() => {
    app.log.fatal({ signal }, 'graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, env.shutdownGraceMs);
  timer.unref();

  try {
    stopScheduler();
    await app.close();
    await closePool();
    app.log.info('shutdown complete');
    clearTimeout(timer);
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'shutdown failed');
    clearTimeout(timer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'unhandled rejection');
});

process.on('uncaughtException', (error) => {
  app.log.fatal({ err: error }, 'uncaught exception, shutting down');
  void shutdown('uncaughtException');
});

app.listen({ port: env.port, host: '0.0.0.0' }).catch((error: unknown) => {
  fail('Failed to bind port.', error);
});
