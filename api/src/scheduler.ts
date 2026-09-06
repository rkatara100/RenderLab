import type { Pool } from 'pg';
import { ensureDailyPartition, rollupAndDropExpiredPartitions } from './db/partitions.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const RETENTION_CATCHUP_DAYS = 6;

export function startScheduler(pool: Pool): NodeJS.Timeout {
  const run = (): void => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - ONE_DAY_MS);
    const tomorrow = new Date(today.getTime() + ONE_DAY_MS);

    ensureDailyPartition(pool, yesterday).catch((error: unknown) => {
      console.error("Failed to ensure yesterday's render_events partition:", error);
    });
    ensureDailyPartition(pool, today).catch((error: unknown) => {
      console.error("Failed to ensure today's render_events partition:", error);
    });
    ensureDailyPartition(pool, tomorrow).catch((error: unknown) => {
      console.error("Failed to ensure tomorrow's render_events partition:", error);
    });

    for (let daysAgo = 0; daysAgo <= RETENTION_CATCHUP_DAYS; daysAgo += 1) {
      const catchupNow = new Date(today.getTime() - daysAgo * ONE_DAY_MS);
      rollupAndDropExpiredPartitions(pool, 7, catchupNow).catch((error: unknown) => {
        console.error('Failed to roll up/drop an expired render_events partition:', error);
      });
    }
  };

  run();
  return setInterval(run, ONE_DAY_MS);
}
