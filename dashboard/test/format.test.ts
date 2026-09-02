import { describe, expect, it } from 'vitest';
import { formatDurationMs } from '../src/lib/format';

describe('formatDurationMs', () => {
  it('formats sub-millisecond durations as microseconds', () => {
    expect(formatDurationMs(0.42)).toBe('420µs');
  });

  it('formats millisecond-and-above durations with two decimal places', () => {
    expect(formatDurationMs(12.345)).toBe('12.35ms');
  });
});
