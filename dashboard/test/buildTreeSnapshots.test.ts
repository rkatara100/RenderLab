import { describe, expect, it } from 'vitest';
import type { ReplayEvent } from '@renderlab/shared-types';
import { buildFrames } from '../src/lib/replay/buildFrames';
import { buildTreeSnapshots } from '../src/lib/replay/buildTreeSnapshots';

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

describe('buildTreeSnapshots', () => {
  it('produces one snapshot per frame, growing the tree monotonically', () => {
    const frames = buildFrames([
      makeEvent({ id: '1', componentName: 'App', componentPath: ['App#0'], commitTime: 10 }),
      makeEvent({
        id: '2',
        componentName: 'SearchBox',
        componentPath: ['App#0', 'SearchBox#0'],
        commitTime: 20,
      }),
    ]);
    const snapshots = buildTreeSnapshots(frames);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toEqual([
      expect.objectContaining({ id: 'App#0', name: 'App', children: [] }),
    ]);
    expect(snapshots[1]?.[0]?.children).toEqual([
      expect.objectContaining({ id: 'SearchBox#0', name: 'SearchBox' }),
    ]);
  });

  it('never mutates an earlier snapshot when a later frame updates the tree', () => {
    const frames = buildFrames([
      makeEvent({ id: '1', componentName: 'App', componentPath: ['App#0'], commitTime: 10 }),
      makeEvent({ id: '2', componentName: 'App', componentPath: ['App#0'], commitTime: 20, durationMs: 5 }),
    ]);
    const snapshots = buildTreeSnapshots(frames);

    expect(snapshots[0]?.[0]?.lastDurationMs).toBe(0.5);
    expect(snapshots[1]?.[0]?.lastDurationMs).toBe(5);
  });

  it('reuses untouched sibling subtrees by reference (structural sharing)', () => {
    const frames = buildFrames([
      makeEvent({ id: '1', componentName: 'App', componentPath: ['App#0'], commitTime: 10 }),
      makeEvent({
        id: '2',
        componentName: 'List',
        componentPath: ['App#0', 'List#0'],
        commitTime: 20,
      }),
      makeEvent({
        id: '3',
        componentName: 'SearchBox',
        componentPath: ['App#0', 'SearchBox#0'],
        commitTime: 30,
      }),
    ]);
    const snapshots = buildTreeSnapshots(frames);

    const listNodeAfterFrame2 = snapshots[1]?.[0]?.children.find((c) => c.id === 'List#0');
    const listNodeAfterFrame3 = snapshots[2]?.[0]?.children.find((c) => c.id === 'List#0');
    expect(listNodeAfterFrame3).toBe(listNodeAfterFrame2);
  });

  it('placeholders an ancestor by id until its own event arrives', () => {
    const frames = buildFrames([
      makeEvent({
        id: '1',
        componentName: 'SearchBox',
        componentPath: ['App#0', 'SearchBox#0'],
        commitTime: 10,
      }),
    ]);
    const snapshots = buildTreeSnapshots(frames);

    expect(snapshots[0]?.[0]).toMatchObject({ id: 'App#0', name: 'App#0' });
  });
});
