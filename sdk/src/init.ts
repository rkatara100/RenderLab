import type { RenderLabConfig } from '@renderlab/shared-types';
import { createRuntime, setGlobalRuntime } from './capture/runtime.js';

/**
 * Call once at the app's entry point (before `ReactDOM.createRoot`), or pass
 * config directly to `RenderLabProvider` instead (ARCHITECTURE.md §4.1).
 * Never throws — a missing/invalid config is reported via `onError` (or a
 * dev-only console warning) and the SDK runs in no-op mode rather than
 * crashing the host app. This is a hard product invariant for a monitoring SDK.
 */
export function init(config: RenderLabConfig): void {
  try {
    setGlobalRuntime(createRuntime(config));
  } catch (error) {
    if (config.onError) {
      config.onError({ message: 'RenderLab: init failed', cause: error });
    } else if (config.environment !== 'production') {
      console.warn('[RenderLab] init failed:', error);
    }
  }
}
