import type { ReplayEvent } from '@renderlab/shared-types';

export interface ReplayFrame {
  commitTime: number;
  events: ReplayEvent[];
}

export function buildFrames(events: ReplayEvent[]): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  for (const event of events) {
    const last = frames[frames.length - 1];
    if (last && last.commitTime === event.commitTime) {
      last.events.push(event);
    } else {
      frames.push({ commitTime: event.commitTime, events: [event] });
    }
  }
  return frames;
}
