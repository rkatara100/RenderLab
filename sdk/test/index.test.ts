import { describe, expect, it } from 'vitest';
import { SDK_VERSION } from '../src/index.js';

describe('@renderlab/sdk (Phase 0 scaffold)', () => {
  it('exposes a version so the build/publish pipeline has something to check', () => {
    expect(SDK_VERSION).toBe('0.0.0');
  });
});
