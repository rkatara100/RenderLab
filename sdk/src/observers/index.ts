import type { RenderLabRuntime } from '../capture/runtime.js';
import { startLongTaskObserver } from './longTaskObserver.js';
import { startNetworkObserver } from './networkObserver.js';

export function startObservers(runtime: RenderLabRuntime): () => void {
  const disposers: Array<() => void> = [];

  if (runtime.config.longTasks.enabled) {
    disposers.push(startLongTaskObserver(runtime));
  }
  if (runtime.config.network.enabled) {
    disposers.push(startNetworkObserver(runtime));
  }

  return () => {
    for (const dispose of disposers) dispose();
  };
}
