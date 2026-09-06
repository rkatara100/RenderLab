import type { RenderPhase } from '@renderlab/shared-types';

const CODES: Record<RenderPhase, number> = {
  mount: 1,
  update: 2,
  unmount: 3,
};

export function phaseToCode(phase: RenderPhase): number {
  return CODES[phase];
}

const PHASES_BY_CODE: Record<number, RenderPhase> = Object.fromEntries(
  Object.entries(CODES).map(([phase, code]) => [code, phase as RenderPhase]),
);

export function codeToPhase(code: number): RenderPhase {
  const phase = PHASES_BY_CODE[code];
  if (!phase) throw new Error(`eventPhaseCodes: unknown phase code ${code}`);
  return phase;
}
