import type { ContextDiffEntry } from '@renderlab/shared-types';

export interface CaptureRegistry {
  contextDiff: ContextDiffEntry[];
  stateChanged: boolean | null;
}

let active: CaptureRegistry | null = null;

export function activateRegistry(registry: CaptureRegistry): void {
  active = registry;
}

export function getActiveRegistry(): CaptureRegistry | null {
  return active;
}
