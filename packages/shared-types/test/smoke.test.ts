import { describe, expect, it } from 'vitest';
import type { PropDiffEntry, RenderEvent, RenderReason } from '../src/index.js';

describe('shared-types', () => {
  it('RenderReason values type-check against the documented rule list', () => {
    const reasons: RenderReason[] = [
      'mount',
      'props-changed',
      'context-changed',
      'state-changed',
      'parent-rerender',
      'unknown',
    ];
    expect(reasons).toHaveLength(6);
  });

  it('a minimal RenderEvent satisfies the shared contract', () => {
    const propsDiff: PropDiffEntry[] = [
      {
        key: 'items',
        prevValue: [],
        nextValue: [],
        referenceEqual: false,
        shallowEqual: true,
        valueType: 'array',
      },
    ];

    const event: RenderEvent = {
      type: 'render',
      eventId: 'evt_1',
      sessionId: 'sess_1',
      appId: 'app_1',
      timestamp: Date.now(),
      sequence: 1,
      componentId: 'comp_1',
      componentName: 'SearchBox',
      componentPath: ['App', 'Header', 'SearchBox'],
      phase: 'update',
      renderReason: 'props-changed',
      propsDiff,
      actualDuration: 0.4,
      baseDuration: 0.6,
      startTime: 12.3,
      commitTime: 12.7,
      isMemoized: false,
      renderCount: 2,
    };

    expect(event.renderReason).toBe('props-changed');
  });
});
