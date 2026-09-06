import { useEffect, useMemo } from 'react';
import type { ReplayEvent } from '@renderlab/shared-types';
import { buildFrames } from '../../lib/replay/buildFrames';
import { buildTreeSnapshots, type ReplayTreeNode } from '../../lib/replay/buildTreeSnapshots';
import { useReplayStore, type ReplaySpeed } from '../../stores/useReplayStore';

const BASE_FRAME_INTERVAL_MS = 400;
const SPEED_OPTIONS: ReplaySpeed[] = [0.5, 1, 2, 4];

export interface ReplayPlayerProps {
  events: ReplayEvent[];
}

function ReplayTreeView({ nodes }: { nodes: ReplayTreeNode[] }): React.JSX.Element | null {
  if (nodes.length === 0) return null;
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.id}>
          <span>{node.name}</span>{' '}
          <span className={`why-panel__reason why-panel__reason--${node.lastRenderReason}`}>
            {node.lastRenderReason}
          </span>{' '}
          <span>{node.lastDurationMs.toFixed(2)}ms</span>
          {node.lastIsAvoidable ? <span className="badge badge--warning">avoidable</span> : null}
          <ReplayTreeView nodes={node.children} />
        </li>
      ))}
    </ul>
  );
}

export function ReplayPlayer({ events }: ReplayPlayerProps): React.JSX.Element {
  const status = useReplayStore((s) => s.status);
  const cursorIndex = useReplayStore((s) => s.cursorIndex);
  const speed = useReplayStore((s) => s.speed);
  const play = useReplayStore((s) => s.play);
  const pause = useReplayStore((s) => s.pause);
  const setSpeed = useReplayStore((s) => s.setSpeed);
  const setCursorIndex = useReplayStore((s) => s.setCursorIndex);
  const advanceCursor = useReplayStore((s) => s.advanceCursor);

  const frames = useMemo(() => buildFrames(events), [events]);
  const snapshots = useMemo(() => buildTreeSnapshots(frames), [frames]);

  useEffect(() => {
    if (status !== 'playing' || frames.length === 0) return undefined;
    const intervalMs = BASE_FRAME_INTERVAL_MS / speed;
    const timer = setInterval(() => advanceCursor(frames.length), intervalMs);
    return () => clearInterval(timer);
  }, [status, speed, frames.length, advanceCursor]);

  if (frames.length === 0) {
    return <p className="coming-soon">No render frames to replay in this session.</p>;
  }

  const clampedCursor = Math.min(cursorIndex, frames.length - 1);
  const currentFrame = frames[clampedCursor];
  const currentTree = snapshots[clampedCursor] ?? [];

  return (
    <div className="timeline-layout">
      <div>
        <div role="group" aria-label="Replay transport">
          <button type="button" onClick={status === 'playing' ? pause : play}>
            {status === 'playing' ? 'Pause' : 'Play'}
          </button>
          <label>
            Speed
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value) as ReplaySpeed)}
            >
              {SPEED_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}x
                </option>
              ))}
            </select>
          </label>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={clampedCursor}
            onChange={(e) => setCursorIndex(Number(e.target.value))}
            aria-label="Replay scrubber"
          />
          <span>
            Frame {clampedCursor + 1} / {frames.length}
          </span>
        </div>
        <ReplayTreeView nodes={currentTree} />
      </div>
      <aside className="why-panel" aria-label="Current frame">
        <h2 className="why-panel__title">Frame {clampedCursor + 1}</h2>
        <p className="why-panel__meta">commitTime {currentFrame?.commitTime.toFixed(2)}</p>
        <ul>
          {currentFrame?.events.map((event) => (
            <li key={event.id}>
              {event.componentName} — {event.renderReason}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
