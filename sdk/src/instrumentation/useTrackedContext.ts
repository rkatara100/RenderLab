import { useContext, useRef, type Context } from 'react';
import { getActiveRegistry } from './registry.js';

export function useTrackedContext<T>(context: Context<T>, name: string): T {
  const value = useContext(context);
  const prevRef = useRef<{ value: T } | null>(null);

  if (prevRef.current !== null) {
    const registry = getActiveRegistry();
    registry?.contextDiff.push({
      contextName: name,
      referenceEqual: Object.is(prevRef.current.value, value),
    });
  }
  prevRef.current = { value };
  return value;
}
