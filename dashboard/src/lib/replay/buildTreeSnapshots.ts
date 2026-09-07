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

function withRemovedPath(nodes: ReplayTreeNode[], path: string[], depth: number): ReplayTreeNode[] {
  const id = path[depth];
  if (id === undefined) return nodes;
  const existingIndex = nodes.findIndex((n) => n.id === id);
  if (existingIndex === -1) return nodes;

  const isLeaf = depth === path.length - 1;
  if (isLeaf) {
    return nodes.filter((n) => n.id !== id);
  }

  const existing = nodes[existingIndex];
  if (!existing) return nodes;
  const updatedChildren = withRemovedPath(existing.children, path, depth + 1);
  const nextNodes = [...nodes];
  nextNodes[existingIndex] = { ...existing, children: updatedChildren };
  return nextNodes;
}

export function buildTreeSnapshots(frames: ReplayFrame[]): ReplayTree[] {
  const snapshots: ReplayTree[] = [];
  let tree: ReplayTree = [];

  for (const frame of frames) {
    for (const event of frame.events) {
      if (event.phase === 'unmount') {
        tree = withRemovedPath(tree, event.componentPath, 0);
        continue;
      }
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
