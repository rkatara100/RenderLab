import type { TelemetryEvent } from '@renderlab/shared-types';

export interface TransportOptions {
  endpoint: string;
  apiKey: string;
  mode: 'fetch' | 'beacon';
}

export interface SessionRef {
  sessionId: string;
  startedAt: number;
}

export function sendBatch(
  events: TelemetryEvent[],
  session: SessionRef,
  options: TransportOptions,
): void {
  const body = JSON.stringify({
    batch_id: crypto.randomUUID(),
    session: {
      sdk_session_key: session.sessionId,
      started_at: new Date(session.startedAt).toISOString(),
    },
    events,
  });
  const url = `${options.endpoint}/api/ingest/events`;

  if (options.mode === 'beacon' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(url, body);
    return;
  }

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
    body,
    keepalive: true,
  }).catch(() => {});
}
