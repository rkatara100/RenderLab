import { describe, expect, it } from 'vitest';
import { codeToPhase, phaseToCode } from '../src/routes/eventPhaseCodes.js';

describe('phaseToCode / codeToPhase', () => {
  it('round-trips every RenderPhase through its code', () => {
    expect(codeToPhase(phaseToCode('mount'))).toBe('mount');
    expect(codeToPhase(phaseToCode('update'))).toBe('update');
    expect(codeToPhase(phaseToCode('unmount'))).toBe('unmount');
  });

  it('assigns distinct codes to each phase', () => {
    const codes = new Set([phaseToCode('mount'), phaseToCode('update'), phaseToCode('unmount')]);
    expect(codes.size).toBe(3);
  });

  it('throws on an unknown code', () => {
    expect(() => codeToPhase(99)).toThrow(/unknown phase code 99/);
  });
});
