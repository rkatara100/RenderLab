import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type {
  ComponentSummary,
  EventPageCursor,
  LongTaskSummary,
  NetworkRequestSummary,
  RenderEventDetail,
  RenderTimelineEvent,
  ReplayEvent,
  SessionSummary,
} from '@renderlab/shared-types';
import { authenticateRequest } from '../auth/apiKey.js';
import {
  getRenderEventDetail,
  listLongTaskEvents,
  listNetworkRequestEvents,
  listRenderEvents,
  listReplayEvents,
  listSessionComponents,
  listSessions,
} from '../db/repository.js';
import { codeToRenderReason } from './renderReasonCodes.js';
import { codeToPhase } from './eventPhaseCodes.js';
import { checkRateLimit } from '../redis/rateLimit.js';
import { redisKeys } from '../redis/keys.js';
import type { RedisLike } from '../redis/hotPath.js';

function parseJsonColumn<T>(value: string | null): T | null {
  return value ? (JSON.parse(value) as T) : null;
}

const LIVE_WINDOW_MS = 60_000;

function isLive(endedAt: string | null, lastSeenAt: string): boolean {
  return endedAt === null && Date.now() - new Date(lastSeenAt).getTime() < LIVE_WINDOW_MS;
}

const DEFAULT_EVENTS_PAGE_SIZE = 200;

const REPLAY_EVENT_CAP = Number(process.env.REPLAY_EVENT_CAP ?? 2000);
const REPLAY_RATE_LIMIT = Number(process.env.REPLAY_RATE_LIMIT_MAX ?? 30);
const REPLAY_RATE_LIMIT_WINDOW_SECONDS = Number(
  process.env.REPLAY_RATE_LIMIT_WINDOW_SECONDS ?? 60,
);

interface EventsQuery {
  limit?: string;
  componentId?: string;
  from?: string;
  to?: string;
  cursorTs?: string;
  cursorId?: string;
  avoidableOnly?: string;
}

interface EventDetailQuery {
  ts?: string;
}

interface PerfEventsQuery {
  limit?: string;
  cursorTs?: string;
  cursorId?: string;
}

function parseCursor(query: PerfEventsQuery): EventPageCursor | undefined {
  return query.cursorTs && query.cursorId
    ? { ts: query.cursorTs, id: query.cursorId }
    : undefined;
}

export interface ReadRouteDeps {
  pool: Pool;
  redis: RedisLike;
}

export function registerReadRoutes(app: FastifyInstance, deps: ReadRouteDeps): void {
  const { pool, redis } = deps;

  app.get('/api/sessions', async (request, reply) => {
    const project = await authenticateRequest(pool, request);
    if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });

    const sessionRows = await listSessions(pool, project.id);
    const sessions: SessionSummary[] = sessionRows.map((session) => ({
      ...session,
      isLive: isLive(session.endedAt, session.lastSeenAt),
    }));
    return reply.send({ sessions });
  });

  app.get<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/components',
    async (request, reply) => {
      const project = await authenticateRequest(pool, request);
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });

      const components: ComponentSummary[] = await listSessionComponents(
        pool,
        project.id,
        request.params.sessionId,
      );
      return reply.send({ components });
    },
  );

  app.get<{ Params: { sessionId: string }; Querystring: EventsQuery }>(
    '/api/sessions/:sessionId/events',
    async (request, reply) => {
      const project = await authenticateRequest(pool, request);
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });

      const query = request.query;
      const limit = Math.min(Number(query.limit) || DEFAULT_EVENTS_PAGE_SIZE, 500);
      const cursor: EventPageCursor | undefined =
        query.cursorTs && query.cursorId ? { ts: query.cursorTs, id: query.cursorId } : undefined;

      const eventRows = await listRenderEvents(pool, {
        sessionId: request.params.sessionId,
        limit,
        ...(query.componentId ? { componentId: Number(query.componentId) } : {}),
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
        ...(query.avoidableOnly === 'true' ? { avoidableOnly: true } : {}),
        ...(cursor ? { cursor } : {}),
      });

      const events: RenderTimelineEvent[] = eventRows.map((eventRow) => ({
        id: eventRow.id,
        ts: eventRow.ts,
        durationMs: eventRow.durationMs,
        renderReason: codeToRenderReason(eventRow.renderReason),
        isAvoidable: eventRow.isAvoidable,
        componentId: eventRow.componentId,
        componentName: eventRow.componentName,
      }));

      const lastEventRow = eventRows[eventRows.length - 1];
      const nextCursor: EventPageCursor | null =
        eventRows.length === limit && lastEventRow
          ? { ts: lastEventRow.ts, id: lastEventRow.id }
          : null;

      return reply.send({ events, nextCursor });
    },
  );

  app.get<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/replay',
    async (request, reply) => {
      const project = await authenticateRequest(pool, request);
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });

      const rateLimit = await checkRateLimit(
        redis,
        redisKeys.rateLimitReplay(project.id),
        REPLAY_RATE_LIMIT,
        REPLAY_RATE_LIMIT_WINDOW_SECONDS,
      );
      if (!rateLimit.allowed) {
        return reply
          .code(429)
          .header('Retry-After', rateLimit.retryAfterSeconds)
          .send({ error: 'rate limit exceeded, try again later' });
      }

      const eventRows = await listReplayEvents(pool, {
        sessionId: request.params.sessionId,
        limit: REPLAY_EVENT_CAP + 1,
      });
      const truncated = eventRows.length > REPLAY_EVENT_CAP;
      const trimmedRows = truncated ? eventRows.slice(0, REPLAY_EVENT_CAP) : eventRows;

      const events: ReplayEvent[] = trimmedRows.map((eventRow) => ({
        id: eventRow.id,
        ts: eventRow.ts,
        durationMs: eventRow.durationMs,
        renderReason: codeToRenderReason(eventRow.renderReason),
        isAvoidable: eventRow.isAvoidable,
        componentId: eventRow.componentId,
        componentName: eventRow.componentName,
        phase: codeToPhase(eventRow.phase),
        componentPath: eventRow.componentPath,
        commitTime: eventRow.commitTime,
      }));

      return reply.send({ events, truncated });
    },
  );

  app.get<{ Params: { sessionId: string; eventId: string }; Querystring: EventDetailQuery }>(
    '/api/sessions/:sessionId/events/:eventId',
    async (request, reply) => {
      const project = await authenticateRequest(pool, request);
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });
      if (!request.query.ts) {
        return reply.code(422).send({ error: 'ts query parameter is required' });
      }

      const row = await getRenderEventDetail(
        pool,
        project.id,
        request.params.sessionId,
        request.params.eventId,
        request.query.ts,
      );
      if (!row) return reply.code(404).send({ error: 'event not found' });

      const detail: RenderEventDetail = {
        id: row.id,
        ts: row.ts,
        durationMs: row.durationMs,
        renderReason: codeToRenderReason(row.renderReason),
        isAvoidable: row.isAvoidable,
        componentId: row.componentId,
        componentName: row.componentName,
        reasonDetail: row.reasonDetail,
        propsDiff: parseJsonColumn<RenderEventDetail['propsDiff']>(row.propsDiff),
        contextDiff: parseJsonColumn<RenderEventDetail['contextDiff']>(row.contextDiff),
      };
      return reply.send(detail);
    },
  );

  app.get<{ Params: { sessionId: string }; Querystring: PerfEventsQuery }>(
    '/api/sessions/:sessionId/long-tasks',
    async (request, reply) => {
      const project = await authenticateRequest(pool, request);
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });

      const limit = Math.min(Number(request.query.limit) || DEFAULT_EVENTS_PAGE_SIZE, 500);
      const cursor = parseCursor(request.query);

      const taskRows = await listLongTaskEvents(pool, {
        sessionId: request.params.sessionId,
        limit,
        ...(cursor ? { cursor } : {}),
      });

      const tasks: LongTaskSummary[] = taskRows.map((row) => ({
        id: row.id,
        ts: row.ts,
        durationMs: row.durationMs,
        attribution: row.attribution,
        correlatedComponentNames: row.correlatedComponentNames,
      }));

      const lastTaskRow = taskRows[taskRows.length - 1];
      const nextCursor: EventPageCursor | null =
        taskRows.length === limit && lastTaskRow ? { ts: lastTaskRow.ts, id: lastTaskRow.id } : null;

      return reply.send({ tasks, nextCursor });
    },
  );

  app.get<{ Params: { sessionId: string }; Querystring: PerfEventsQuery }>(
    '/api/sessions/:sessionId/network-requests',
    async (request, reply) => {
      const project = await authenticateRequest(pool, request);
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });

      const limit = Math.min(Number(request.query.limit) || DEFAULT_EVENTS_PAGE_SIZE, 500);
      const cursor = parseCursor(request.query);

      const requestRows = await listNetworkRequestEvents(pool, {
        sessionId: request.params.sessionId,
        limit,
        ...(cursor ? { cursor } : {}),
      });

      const requests: NetworkRequestSummary[] = requestRows.map((row) => ({
        id: row.id,
        ts: row.ts,
        url: row.url,
        method: row.method,
        status: row.status,
        durationMs: row.durationMs,
        initiatorType: row.initiatorType,
        transferSize: row.transferSize,
      }));

      const lastRequestRow = requestRows[requestRows.length - 1];
      const nextCursor: EventPageCursor | null =
        requestRows.length === limit && lastRequestRow
          ? { ts: lastRequestRow.ts, id: lastRequestRow.id }
          : null;

      return reply.send({ requests, nextCursor });
    },
  );
}
