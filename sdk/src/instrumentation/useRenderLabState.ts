import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { getActiveRegistry } from './registry.js';

export function useRenderLabState<S>(
  initialState: S | (() => S),
): [S, Dispatch<SetStateAction<S>>] {
  const [state, setState] = useState(initialState);
  const prevRef = useRef<{ value: S } | null>(null);

  if (prevRef.current !== null) {
    const changed = !Object.is(prevRef.current.value, state);
    const registry = getActiveRegistry();
    if (registry) {
      registry.stateChanged = registry.stateChanged === true || changed;
    }
  }
  prevRef.current = { value: state };
  return [state, setState];
}
