import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { startScheduler } from '../src/scheduler.js';
import { createFakePool } from './fakes.js';

describe('startScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ensures both today\'s and tomorrow\'s partition on the initial run', async () => {
    const fake = createFakePool();
    const timer = startScheduler(fake as unknown as Pool);
    await vi.waitFor(() => {
      expect(fake.calls.some((call) => call.text.includes('render_events_2026_03_15'))).toBe(true);
    });

    const createStatements = fake.calls.filter((call) => call.text.includes('CREATE TABLE IF NOT EXISTS'));
    expect(createStatements.some((call) => call.text.includes('render_events_2026_03_15'))).toBe(true);
    expect(createStatements.some((call) => call.text.includes('render_events_2026_03_16'))).toBe(true);

    clearInterval(timer);
  });

  it('rolls up and drops the partition that just aged out of the 7-day retention window', async () => {
    const fake = createFakePool((text) =>
      text.includes('to_regclass') ? { rows: [{ exists: 'render_events_2026_03_08' }] } : { rows: [] },
    );
    const timer = startScheduler(fake as unknown as Pool);
    await vi.waitFor(() => {
      expect(fake.calls.some((call) => call.text.includes('render_events_2026_03_08'))).toBe(true);
    });

    expect(fake.calls.some((call) => call.text === 'DROP TABLE IF EXISTS render_events_2026_03_08')).toBe(
      true,
    );

    clearInterval(timer);
  });

  it('runs again after 24h', async () => {
    const fake = createFakePool();
    const timer = startScheduler(fake as unknown as Pool);
    await vi.waitFor(() => expect(fake.calls.length).toBeGreaterThan(0));

    const firstRunCount = fake.calls.length;
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(fake.calls.length).toBeGreaterThan(firstRunCount);

    clearInterval(timer);
  });
});
