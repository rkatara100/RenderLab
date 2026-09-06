import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type {
  LongTaskEvent,
  NetworkRequestEvent,
  RenderEvent,
  TelemetryEvent,
} from '@renderlab/shared-types';
import { authenticateRequest } from '../auth/apiKey.js';
import {
  endSession,
  insertLongTaskEvents,
  insertNetworkRequestEvents,
  insertRenderEvents,
  upsertComponent,
  upsertSession,
  type LongTaskEventRow,
  type NetworkRequestEventRow,
  type RenderEventRow,
} from '../db/repository.js';
import { flushSessionRollup } from '../redis/flushJob.js';
import {
  clearDuplicateMarker,
  isDuplicateBatch,
  recordBatchHotPath,
  type HotPathEvent,
  type RedisLike,
} from '../redis/hotPath.js';
import { checkRateLimit } from '../redis/rateLimit.js';
import { redisKeys } from '../redis/keys.js';
import {
  isAvoidableRender,
  renderReasonToCode,
  shouldPersistContextDiff,
  shouldPersistPropsDiff,
} from './renderReasonCodes.js';
import { phaseToCode } from './eventPhaseCodes.js';
import { getEnv, type AppEnv } from '../config/env.js';

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
  env?: AppEnv;
}

function isRenderEvent(event: TelemetryEvent): event is RenderEvent {
  return event.type === 'render';
}

function isLongTaskEvent(event: TelemetryEvent): event is LongTaskEvent {
  return event.type === 'long-task';
}

function isNetworkRequestEvent(event: TelemetryEvent): event is NetworkRequestEvent {
  return event.type === 'network-request';
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  const time = parsed.getTime();
  if (!Number.isFinite(time)) return null;
  return parsed.toISOString();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateBatchEvents(events: TelemetryEvent[]): string | null {
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (typeof event !== 'object' || event === null) {
      return `events[${index}] is not an object`;
    }
    if (toIsoTimestamp(event.timestamp) === null) {
      return `events[${index}].timestamp is not a valid date`;
    }
    if (isRenderEvent(event)) {
      if (!isNonEmptyString(event.componentName)) {
        return `events[${index}].componentName is required`;
      }
      if (!isFiniteNumber(event.actualDuration)) {
        return `events[${index}].actualDuration must be a finite number`;
      }
    } else if (isLongTaskEvent(event)) {
      if (!isFiniteNumber(event.duration)) {
        return `events[${index}].duration must be a finite number`;
      }
    } else if (isNetworkRequestEvent(event)) {
      if (!isNonEmptyString(event.url)) {
        return `events[${index}].url is required`;
      }
      if (!isFiniteNumber(event.duration)) {
        return `events[${index}].duration must be a finite number`;
      }
    } else {
      return `events[${index}].type is not a recognised event type`;
    }
  }
  return null;
}

export function registerIngestRoutes(app: FastifyInstance, deps: IngestRouteDeps): void {
  const { pool, redis } = deps;
  const env = deps.env ?? getEnv();

  app.post<{ Body: IngestEventsBody }>('/api/ingest/events', async (request, reply) => {
    const project = await authenticateRequest(pool, request, 'ingest');
    if (!project) {
      return reply.code(401).send({ error: 'invalid or missing API key' });
    }

    const rateLimit = await checkRateLimit(
      redis,
      redisKeys.rateLimitIngest(project.id),
      env.ingestRateLimitMax,
      env.ingestRateLimitWindowSeconds,
    );
    if (rateLimit.degraded) {
      request.log.warn({ projectId: project.id }, 'rate limiter degraded, allowing request');
    }
    if (!rateLimit.allowed) {
      return reply
        .code(429)
        .header('Retry-After', rateLimit.retryAfterSeconds)
        .send({ error: 'rate limit exceeded, try again later' });
    }

    const body = request.body;
    if (!body?.batch_id || !body.session?.sdk_session_key || !Array.isArray(body.events)) {
      return reply.code(422).send({ error: 'malformed batch' });
    }
    if (body.events.length > MAX_EVENTS_PER_BATCH) {
      return reply.code(413).send({ error: `batch exceeds ${MAX_EVENTS_PER_BATCH} events` });
    }
    if (toIsoTimestamp(body.session.started_at) === null) {
      return reply.code(422).send({ error: 'session.started_at is not a valid date' });
    }
    const invalidEvent = validateBatchEvents(body.events);
    if (invalidEvent !== null) {
      return reply.code(422).send({ error: invalidEvent });
    }

    if (await isDuplicateBatch(redis, project.id, body.batch_id)) {
      return reply
        .code(202)
        .send({ accepted: true, batch_id: body.batch_id, event_count: body.events.length });
    }

    try {
      const sessionId = await upsertSession(pool, {
        projectId: project.id,
        sdkSessionKey: body.session.sdk_session_key,
        startedAt: body.session.started_at,
        url: body.session.url,
        userAgent: body.session.user_agent,
        appVersion: body.session.app_version,
      });

      const renderEvents = body.events.filter(isRenderEvent);

      const componentIdByName = new Map<string, number>();
      for (const name of new Set(renderEvents.map((e) => e.componentName))) {
        componentIdByName.set(name, await upsertComponent(pool, project.id, name));
      }

      const rows: RenderEventRow[] = [];
      const hotPathBatch: HotPathEvent[] = [];
      for (const event of renderEvents) {
        const componentId = componentIdByName.get(event.componentName);
        if (componentId === undefined) continue;
        const isAvoidable = isAvoidableRender(event.renderReason);

        rows.push({
          sessionId,
          componentId,
          ts: new Date(event.timestamp).toISOString(),
          durationMs: event.actualDuration,
          renderReason: renderReasonToCode(event.renderReason),
          isAvoidable,
          reasonDetail: event.reasonDetail ?? null,
          propsDiff: shouldPersistPropsDiff(event.renderReason)
            ? JSON.stringify(event.propsDiff)
            : null,
          contextDiff:
            shouldPersistContextDiff(event.renderReason) && event.contextDiff
              ? JSON.stringify(event.contextDiff)
              : null,
          phase: phaseToCode(event.phase),
          componentPath: event.componentPath,
          commitTime: event.commitTime,
        });
        hotPathBatch.push({ componentId, durationMs: event.actualDuration, isAvoidable });
      }

      await insertRenderEvents(pool, project.id, rows);
      await recordBatchHotPath(redis, project.id, sessionId, hotPathBatch);

      await flushSessionRollup(pool, redis, project.id, sessionId);

      const longTaskRows: LongTaskEventRow[] = body.events.filter(isLongTaskEvent).map((event) => ({
        sessionId,
        ts: new Date(event.timestamp).toISOString(),
        durationMs: event.duration,
        attribution: event.attribution,
      }));
      await insertLongTaskEvents(pool, project.id, longTaskRows);

      const networkRequestRows: NetworkRequestEventRow[] = body.events
        .filter(isNetworkRequestEvent)
        .map((event) => ({
          sessionId,
          ts: new Date(event.timestamp).toISOString(),
          url: event.url,
          method: event.method,
          status: event.status ?? null,
          durationMs: event.duration,
          initiatorType: event.initiatorType,
          transferSize: event.transferSize ?? null,
        }));
      await insertNetworkRequestEvents(pool, project.id, networkRequestRows);
    } catch (error) {
      await clearDuplicateMarker(redis, project.id, body.batch_id);
      throw error;
    }

    return reply
      .code(202)
      .send({ accepted: true, batch_id: body.batch_id, event_count: body.events.length });
  });

  app.post<{ Body: SessionEndBody }>('/api/ingest/session-end', async (request, reply) => {
    const project = await authenticateRequest(pool, request, 'ingest');
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
