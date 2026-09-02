/**
 * @renderlab/sdk — public entry point.
 *
 * Phase 0 scaffolding only: this package currently re-exports the shared
 * event/config contract so downstream packages can wire against it. The
 * actual instrumentation (`init`, `RenderLabProvider`, `withRenderLabProfiler`,
 * the props/context/state diffing, and the render-reason heuristic) is
 * Phase 1 work — see ARCHITECTURE.md section 4 for the full public API this
 * package will expose.
 */
export type { RenderLabConfig } from '@renderlab/shared-types';

export const SDK_VERSION = '0.0.0';
