import type { RenderLabConfig } from '@renderlab/shared-types';
import { createRuntime, setGlobalRuntime } from './capture/runtime.js';

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
