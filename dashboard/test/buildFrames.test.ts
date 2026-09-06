import { describe, expect, it } from 'vitest';
import type { ReplayEvent } from '@renderlab/shared-types';
import { buildFrames } from '../src/lib/replay/buildFrames';

function makeEvent(overrides: Partial<ReplayEvent> = {}): ReplayEvent {
  return {
    id: '1',
    ts: '2026-01-01T00:00:00.000Z',
    durationMs: 0.5,
    renderReason: 'mount',
    isAvoidable: false,
    componentId: 1,
    componentName: 'SearchBox',
    phase: 'mount',
    componentPath: ['App#0', 'SearchBox#0'],
    commitTime: 10,
    ...overrides,
  };
}

describe('buildFrames', () => {
  it('groups events sharing the exact same commitTime into one frame', () => {
    const frames = buildFrames([
      makeEvent({ id: '1', commitTime: 10 }),
      makeEvent({ id: '2', commitTime: 10 }),
      makeEvent({ id: '3', commitTime: 20 }),
    ]);

    expect(frames).toHaveLength(2);
    expect(frames[0]?.events.map((e) => e.id)).toEqual(['1', '2']);
    expect(frames[1]?.events.map((e) => e.id)).toEqual(['3']);
  });

  it('does not merge events with different commitTime even if ts matches', () => {
    const frames = buildFrames([
      makeEvent({ id: '1', ts: '2026-01-01T00:00:00.000Z', commitTime: 10 }),
      makeEvent({ id: '2', ts: '2026-01-01T00:00:00.000Z', commitTime: 10.001 }),
    ]);

    expect(frames).toHaveLength(2);
  });

  it('returns an empty array for no events', () => {
    expect(buildFrames([])).toEqual([]);
  });
});
