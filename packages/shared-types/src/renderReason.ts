
export type RenderReason =
  'mount' | 'props-changed' | 'context-changed' | 'state-changed' | 'parent-rerender' | 'unknown';

export type PropValueType = 'primitive' | 'function' | 'object' | 'array' | 'element' | 'other';

export interface PropDiffEntry {
  key: string;
  prevValue: unknown;
  nextValue: unknown;
  referenceEqual: boolean;
  shallowEqual: boolean;
  valueType: PropValueType;
}

export interface ContextDiffEntry {
  contextName: string;
  referenceEqual: boolean;
}
