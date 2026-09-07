import type { Pool } from 'pg';
import { ensureDailyPartition, rollupAndDropExpiredPartitions } from './db/partitions.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const RETENTION_CATCHUP_DAYS = 6;

export interface SchedulerLogger {
  error: (context: Record<string, unknown>, message: string) => void;
  info: (context: Record<string, unknown>, message: string) => void;
}

export interface SchedulerOptions {
  retentionDays?: number;
  logger?: SchedulerLogger;
}

const consoleLogger: SchedulerLogger = {
  error: (context, message) => console.error(message, context),
  info: (context, message) => console.log(message, context),
};

let timer: NodeJS.Timeout | null = null;

export function startScheduler(pool: Pool, options: SchedulerOptions = {}): NodeJS.Timeout {
  const retentionDays = options.retentionDays ?? 7;
  const log = options.logger ?? consoleLogger;

  const run = (): void => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - ONE_DAY_MS);
    const tomorrow = new Date(today.getTime() + ONE_DAY_MS);

    const partitions: Array<[string, Date]> = [
      ['yesterday', yesterday],
      ['today', today],
      ['tomorrow', tomorrow],
    ];

    for (const [label, day] of partitions) {
      ensureDailyPartition(pool, day).catch((error: unknown) => {
        log.error(
          { err: error, partition: label, day: day.toISOString() },
          'failed to ensure render_events partition',
        );
      });
    }

    for (let daysAgo = 0; daysAgo <= RETENTION_CATCHUP_DAYS; daysAgo += 1) {
      const catchupNow = new Date(today.getTime() - daysAgo * ONE_DAY_MS);
      rollupAndDropExpiredPartitions(pool, retentionDays, catchupNow).catch((error: unknown) => {
        log.error(
          { err: error, daysAgo, retentionDays },
          'failed to roll up and drop an expired render_events partition',
        );
      });
    }
  };

  run();
  timer = setInterval(run, ONE_DAY_MS);
  return timer;
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
