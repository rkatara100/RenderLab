import { createContext } from 'react';
import type { RenderLabRuntime } from '../capture/runtime.js';

export const ComponentPathContext = createContext<string[]>([]);

export const RenderLabRuntimeContext = createContext<RenderLabRuntime | null>(null);
