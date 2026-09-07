import type { TelemetryEvent } from '@renderlab/shared-types';
import { createId } from './ids.js';
import { SDK_VERSION } from '../version.js';

export interface TransportOptions {
  endpoint: string;
  apiKey: string;
  mode: 'fetch' | 'beacon';
  appVersion?: string | undefined;
}

export interface SessionRef {
  sessionId: string;
  startedAt: number;
}

export async function sendBatch(
  events: TelemetryEvent[],
  session: SessionRef,
  options: TransportOptions,
): Promise<void> {
  const body = JSON.stringify({
    batch_id: createId(),
    sdk_version: SDK_VERSION,
    session: {
      sdk_session_key: session.sessionId,
      started_at: new Date(session.startedAt).toISOString(),
      app_version: options.appVersion,
    },
    events,
  });
  const url = `${options.endpoint}/api/ingest/events`;

  if (options.mode === 'beacon' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const queued = navigator.sendBeacon(url, body);
    if (!queued) throw new Error('RenderLab: sendBeacon was rejected by the browser');
    return;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
    body,
    keepalive: true,
  });
  if (!response.ok) {
    throw new Error(`RenderLab: ingest request failed with status ${response.status}`);
  }
}
