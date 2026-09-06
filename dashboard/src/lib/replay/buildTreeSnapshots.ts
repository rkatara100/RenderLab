import type { RenderReason } from '@renderlab/shared-types';
import type { ReplayFrame } from './buildFrames';

export interface ReplayTreeNode {
  id: string;
  name: string;
  children: ReplayTreeNode[];
  lastRenderReason: RenderReason;
  lastDurationMs: number;
  lastIsAvoidable: boolean;
}

export type ReplayTree = ReplayTreeNode[];

interface NodeStats {
  renderReason: RenderReason;
  durationMs: number;
  isAvoidable: boolean;
}

function withUpdatedPath(
  nodes: ReplayTreeNode[],
  path: string[],
  depth: number,
  componentName: string,
  stats: NodeStats,
): ReplayTreeNode[] {
  const id = path[depth];
  if (id === undefined) return nodes;
  const isLeaf = depth === path.length - 1;
  const existingIndex = nodes.findIndex((n) => n.id === id);
  const existing = existingIndex === -1 ? null : nodes[existingIndex];

  const updatedNode: ReplayTreeNode = {
    id,
    name: isLeaf ? componentName : (existing?.name ?? id),
    children: existing?.children ?? [],
    lastRenderReason: isLeaf ? stats.renderReason : (existing?.lastRenderReason ?? 'mount'),
    lastDurationMs: isLeaf ? stats.durationMs : (existing?.lastDurationMs ?? 0),
    lastIsAvoidable: isLeaf ? stats.isAvoidable : (existing?.lastIsAvoidable ?? false),
  };

  if (!isLeaf) {
    updatedNode.children = withUpdatedPath(updatedNode.children, path, depth + 1, componentName, stats);
  }

  if (existingIndex === -1) return [...nodes, updatedNode];
  const nextNodes = [...nodes];
  nextNodes[existingIndex] = updatedNode;
  return nextNodes;
}

export function buildTreeSnapshots(frames: ReplayFrame[]): ReplayTree[] {
  const snapshots: ReplayTree[] = [];
  let tree: ReplayTree = [];

  for (const frame of frames) {
    for (const event of frame.events) {
      tree = withUpdatedPath(tree, event.componentPath, 0, event.componentName, {
        renderReason: event.renderReason,
        durationMs: event.durationMs,
        isAvoidable: event.isAvoidable,
      });
    }
    snapshots.push(tree);
  }

  return snapshots;
}
