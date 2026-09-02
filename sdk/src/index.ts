/**
 * @renderlab/sdk — public entry point. See ARCHITECTURE.md section 4 for the
 * full documented API surface and section 5 for the render-reason heuristic.
 */
export { init } from './init.js';
export { RenderLabProvider } from './provider/RenderLabProvider.js';
export type { RenderLabProviderProps } from './provider/RenderLabProvider.js';

export { withRenderLabProfiler } from './instrumentation/withRenderLabProfiler.js';
export { useRenderLabProfiler } from './instrumentation/useRenderLabProfiler.js';
export { useTrackedContext } from './instrumentation/useTrackedContext.js';
export { useRenderLabState } from './instrumentation/useRenderLabState.js';

export { computeRenderReason } from './instrumentation/renderReason.js';
export type { RenderReasonInput, RenderReasonResult } from './instrumentation/renderReason.js';
export { diffProps, hasChangedProps } from './instrumentation/propsDiff.js';

export type {
  PropDiffEntry,
  RenderEvent,
  RenderLabConfig,
  RenderReason,
  TelemetryEvent,
} from '@renderlab/shared-types';

export const SDK_VERSION = '0.0.0';
