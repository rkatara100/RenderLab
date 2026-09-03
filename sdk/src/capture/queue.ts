import type { TelemetryEvent } from '@renderlab/shared-types';

export interface EventSink {
  enqueue: (event: TelemetryEvent) => void;
}

export interface BatchQueueOptions {
  maxSize: number;
  flushIntervalMs: number;
  maxQueueBytes: number;
  onFlush: (events: TelemetryEvent[]) => void;
}

function estimateBytes(event: TelemetryEvent): number {
  return JSON.stringify(event).length;
}

export class BatchQueue implements EventSink {
  private buffer: TelemetryEvent[] = [];
  private bytes = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: BatchQueueOptions) {
    this.timer = setInterval(() => this.flush(), options.flushIntervalMs);
  }

  enqueue(event: TelemetryEvent): void {
    this.buffer.push(event);
    this.bytes += estimateBytes(event);

    while (this.bytes > this.options.maxQueueBytes && this.buffer.length > 1) {
      const dropped = this.buffer.shift();
      if (dropped) this.bytes -= estimateBytes(dropped);
    }

    if (this.buffer.length >= this.options.maxSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    this.bytes = 0;
    this.options.onFlush(batch);
  }

  get size(): number {
    return this.buffer.length;
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
