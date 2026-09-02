import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { RenderEvent, TelemetryEvent } from '@renderlab/shared-types';
import { authenticateRequest } from '../auth/apiKey.js';
import {
  endSession,
  insertRenderEvents,
  upsertComponent,
  upsertSession,
  type RenderEventRow,
} from '../db/repository.js';
import { flushSessionRollup } from '../redis/flushJob.js';
import {
  isDuplicateBatch,
  recordBatchHotPath,
  type HotPathEvent,
  type RedisLike,
} from '../redis/hotPath.js';
import { isAvoidableRender, renderReasonToCode } from './renderReasonCodes.js';

/** Hard server-side cap regardless of SDK behavior (ARCHITECTURE.md §3.4) —
 * the SDK's own default batches at 250/2s; this defends against a
 * misbehaving or compromised SDK instance. */
const MAX_EVENTS_PER_BATCH = 500;

interface IngestEventsBody {
  batch_id: string;
  session: {
    sdk_session_key: string;
    started_at: string;
    url?: string;
    user_agent?: string;
    app_version?: string;
  };
  events: TelemetryEvent[];
}

interface SessionEndBody {
  sdk_session_key: string;
}

export interface IngestRouteDeps {
  pool: Pool;
  redis: RedisLike;
}

function isRenderEvent(event: TelemetryEvent): event is RenderEvent {
  return event.type === 'render';
}

export function registerIngestRoutes(app: FastifyInstance, deps: IngestRouteDeps): void {
  const { pool, redis } = deps;

  app.post<{ Body: IngestEventsBody }>('/api/ingest/events', async (request, reply) => {
    const project = await authenticateRequest(pool, request);
    if (!project) {
      return reply.code(401).send({ error: 'invalid or missing API key' });
    }

    const body = request.body;
    if (!body?.batch_id || !body.session?.sdk_session_key || !Array.isArray(body.events)) {
      return reply.code(422).send({ error: 'malformed batch' });
    }
    if (body.events.length > MAX_EVENTS_PER_BATCH) {
      return reply.code(413).send({ error: `batch exceeds ${MAX_EVENTS_PER_BATCH} events` });
    }

    // Idempotent replay: an SDK retry after a network blip that actually
    // succeeded gets a 202 without re-inserting (ARCHITECTURE.md §3.4).
    if (await isDuplicateBatch(redis, project.id, body.batch_id)) {
      return reply
        .code(202)
        .send({ accepted: true, batch_id: body.batch_id, event_count: body.events.length });
    }

    const sessionId = await upsertSession(pool, {
      projectId: project.id,
      sdkSessionKey: body.session.sdk_session_key,
      startedAt: body.session.started_at,
      url: body.session.url,
      userAgent: body.session.user_agent,
      appVersion: body.session.app_version,
    });

    const renderEvents = body.events.filter(isRenderEvent);

    // Dedupe component upserts within the batch — O(unique components), not
    // O(events), which matters directly at 10k+ events/session.
    const componentIdByName = new Map<string, number>();
    for (const name of new Set(renderEvents.map((e) => e.componentName))) {
      componentIdByName.set(name, await upsertComponent(pool, project.id, name));
    }

    const rows: RenderEventRow[] = [];
    const hotPathBatch: HotPathEvent[] = [];
    for (const event of renderEvents) {
      const componentId = componentIdByName.get(event.componentName);
      if (componentId === undefined) continue; // unreachable given the loop above, but keeps TS honest
      const isAvoidable = isAvoidableRender(event.renderReason);

      rows.push({
        sessionId,
        componentId,
        ts: new Date(event.timestamp).toISOString(),
        durationMs: event.actualDuration,
        renderReason: renderReasonToCode(event.renderReason),
        isAvoidable,
        propsDiff: isAvoidable ? JSON.stringify(event.propsDiff) : null,
      });
      hotPathBatch.push({ componentId, durationMs: event.actualDuration, isAvoidable });
    }

    await insertRenderEvents(pool, project.id, rows);
    await recordBatchHotPath(redis, project.id, sessionId, hotPathBatch);
    // Flushed inline per batch rather than on a separate timer — see
    // flushJob.ts doc comment for the trade-off this makes.
    await flushSessionRollup(pool, redis, project.id, sessionId);

    return reply
      .code(202)
      .send({ accepted: true, batch_id: body.batch_id, event_count: body.events.length });
  });

  app.post<{ Body: SessionEndBody }>('/api/ingest/session-end', async (request, reply) => {
    const project = await authenticateRequest(pool, request);
    if (!project) {
      return reply.code(401).send({ error: 'invalid or missing API key' });
    }
    if (!request.body?.sdk_session_key) {
      return reply.code(422).send({ error: 'missing sdk_session_key' });
    }

    await endSession(pool, project.id, request.body.sdk_session_key);
    return reply.code(202).send({ accepted: true });
  });
}
