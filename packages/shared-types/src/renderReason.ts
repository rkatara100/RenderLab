/**
 * The SDK's "why did this render?" heuristic result — an ordered rule list,
 * first match wins. See ARCHITECTURE.md section 5 for the full rule order.
 */
export type RenderReason =
  'mount' | 'props-changed' | 'context-changed' | 'state-changed' | 'parent-rerender' | 'unknown';

export type PropValueType = 'primitive' | 'function' | 'object' | 'array' | 'element' | 'other';

/**
 * One prop's before/after comparison for a single render. `referenceEqual`
 * drives the mount/props-changed rule directly; `shallowEqual` additionally
 * distinguishes "different reference, same shape" (e.g. a freshly-spread
 * object) from a genuine value change, for the Phase 5 analysis UI.
 */
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
