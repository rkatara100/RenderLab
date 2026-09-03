import type { RenderReason } from '@renderlab/shared-types';

const CODES: Record<RenderReason, number> = {
  mount: 1,
  'props-changed': 2,
  'state-changed': 3,
  'context-changed': 4,
  'parent-rerender': 5,
  unknown: 6,
};

export function renderReasonToCode(reason: RenderReason): number {
  return CODES[reason];
}

const REASONS_BY_CODE: Record<number, RenderReason> = Object.fromEntries(
  Object.entries(CODES).map(([reason, code]) => [code, reason as RenderReason]),
);

export function codeToRenderReason(code: number): RenderReason {
  const reason = REASONS_BY_CODE[code];
  if (!reason) throw new Error(`renderReasonCodes: unknown render_reason code ${code}`);
  return reason;
}

export function isAvoidableRender(reason: RenderReason): boolean {
  return reason === 'parent-rerender';
}

export function shouldPersistPropsDiff(reason: RenderReason): boolean {
  return reason === 'props-changed' || isAvoidableRender(reason);
}

export function shouldPersistContextDiff(reason: RenderReason): boolean {
  return reason === 'context-changed';
}
