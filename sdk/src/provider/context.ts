import { createContext } from 'react';
import type { RenderLabRuntime } from '../capture/runtime.js';

/** Ancestor componentIds, root-first — substitutes for fiber parent pointers
 * (see ARCHITECTURE.md §8.8). Only instrumented ancestors appear here. */
export const ComponentPathContext = createContext<string[]>([]);

/** null when the SDK hasn't been initialized (no `init()`/`RenderLabProvider`) —
 * every capture hook must no-op gracefully in that case. */
export const RenderLabRuntimeContext = createContext<RenderLabRuntime | null>(null);
