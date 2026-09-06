import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type {
  ComponentSummary,
  EventPageCursor,
  LongTaskSummary,
  NetworkRequestSummary,
  RenderEventDetail,
  RenderReason,
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
import { codeToRenderReason, renderReasonToCode } from './renderReasonCodes.js';
import { codeToPhase } from './eventPhaseCodes.js';
import { checkRateLimit } from '../redis/rateLimit.js';
import { redisKeys } from '../redis/keys.js';
import type { RedisLike } from '../redis/hotPath.js';

const VALID_RENDER_REASONS: RenderReason[] = [
  'mount',
  'props-changed',
  'context-changed',
  'state-changed',
  'parent-rerender',
  'unknown',
];

function parseRenderReasons(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const codes = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is RenderReason => VALID_RENDER_REASONS.includes(value as RenderReason))
    .map(renderReasonToCode);
  return codes.length > 0 ? codes : undefined;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function parseLimit(raw: string | undefined, fallback: number, cap: number): number | null {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Math.min(value, cap);
}

function parseComponentId(raw: string | undefined): number | null | undefined {
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
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

const READ_RATE_LIMIT = Number(process.env.READ_RATE_LIMIT_MAX ?? 120);
const READ_RATE_LIMIT_WINDOW_SECONDS = Number(process.env.READ_RATE_LIMIT_WINDOW_SECONDS ?? 60);

async function checkReadRateLimit(redis: RedisLike, projectId: string) {
  return checkRateLimit(
    redis,
    redisKeys.rateLimitRead(projectId),
    READ_RATE_LIMIT,
    READ_RATE_LIMIT_WINDOW_SECONDS,
  );
}

interface EventsQuery {
  limit?: string;
  componentId?: string;
  from?: string;
  to?: string;
  cursorTs?: string;
  cursorId?: string;
  avoidableOnly?: string;
  search?: string;
  renderReason?: string;
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
    const project = await authenticateRequest(pool, request, 'dashboard');
    if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });

    const rateLimit = await checkReadRateLimit(redis, project.id);
    if (!rateLimit.allowed) {
      return reply
        .code(429)
        .header('Retry-After', rateLimit.retryAfterSeconds)
        .send({ error: 'rate limit exceeded, try again later' });
    }

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
      const project = await authenticateRequest(pool, request, 'dashboard');
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });
      if (!isValidUuid(request.params.sessionId)) {
        return reply.code(422).send({ error: 'sessionId must be a valid UUID' });
      }

      const rateLimit = await checkReadRateLimit(redis, project.id);
      if (!rateLimit.allowed) {
        return reply
          .code(429)
          .header('Retry-After', rateLimit.retryAfterSeconds)
          .send({ error: 'rate limit exceeded, try again later' });
      }

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
      const project = await authenticateRequest(pool, request, 'dashboard');
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });
      if (!isValidUuid(request.params.sessionId)) {
        return reply.code(422).send({ error: 'sessionId must be a valid UUID' });
      }

      const rateLimit = await checkReadRateLimit(redis, project.id);
      if (!rateLimit.allowed) {
        return reply
          .code(429)
          .header('Retry-After', rateLimit.retryAfterSeconds)
          .send({ error: 'rate limit exceeded, try again later' });
      }

      const query = request.query;
      const limit = parseLimit(query.limit, DEFAULT_EVENTS_PAGE_SIZE, 500);
      if (limit === null) {
        return reply.code(422).send({ error: 'limit must be a non-negative integer' });
      }
      const componentId = parseComponentId(query.componentId);
      if (componentId === null) {
        return reply.code(422).send({ error: 'componentId must be an integer' });
      }
      const cursor: EventPageCursor | undefined =
        query.cursorTs && query.cursorId ? { ts: query.cursorTs, id: query.cursorId } : undefined;

      const renderReasonCodes = parseRenderReasons(query.renderReason);

      const eventRows = await listRenderEvents(pool, {
        sessionId: request.params.sessionId,
        projectId: project.id,
        limit,
        ...(componentId !== undefined ? { componentId } : {}),
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
        ...(query.avoidableOnly === 'true' ? { avoidableOnly: true } : {}),
        ...(query.search ? { search: query.search } : {}),
        ...(renderReasonCodes ? { renderReasonCodes } : {}),
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
      const project = await authenticateRequest(pool, request, 'dashboard');
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });
      if (!isValidUuid(request.params.sessionId)) {
        return reply.code(422).send({ error: 'sessionId must be a valid UUID' });
      }

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
        projectId: project.id,
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
      const project = await authenticateRequest(pool, request, 'dashboard');
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });
      if (!isValidUuid(request.params.sessionId)) {
        return reply.code(422).send({ error: 'sessionId must be a valid UUID' });
      }
      if (!request.query.ts) {
        return reply.code(422).send({ error: 'ts query parameter is required' });
      }

      const rateLimit = await checkReadRateLimit(redis, project.id);
      if (!rateLimit.allowed) {
        return reply
          .code(429)
          .header('Retry-After', rateLimit.retryAfterSeconds)
          .send({ error: 'rate limit exceeded, try again later' });
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
        propsDiff: row.propsDiff,
        contextDiff: row.contextDiff,
      };
      return reply.send(detail);
    },
  );

  app.get<{ Params: { sessionId: string }; Querystring: PerfEventsQuery }>(
    '/api/sessions/:sessionId/long-tasks',
    async (request, reply) => {
      const project = await authenticateRequest(pool, request, 'dashboard');
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });
      if (!isValidUuid(request.params.sessionId)) {
        return reply.code(422).send({ error: 'sessionId must be a valid UUID' });
      }

      const rateLimit = await checkReadRateLimit(redis, project.id);
      if (!rateLimit.allowed) {
        return reply
          .code(429)
          .header('Retry-After', rateLimit.retryAfterSeconds)
          .send({ error: 'rate limit exceeded, try again later' });
      }

      const limit = parseLimit(request.query.limit, DEFAULT_EVENTS_PAGE_SIZE, 500);
      if (limit === null) {
        return reply.code(422).send({ error: 'limit must be a non-negative integer' });
      }
      const cursor = parseCursor(request.query);

      const taskRows = await listLongTaskEvents(pool, {
        sessionId: request.params.sessionId,
        projectId: project.id,
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
      const project = await authenticateRequest(pool, request, 'dashboard');
      if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });
      if (!isValidUuid(request.params.sessionId)) {
        return reply.code(422).send({ error: 'sessionId must be a valid UUID' });
      }

      const rateLimit = await checkReadRateLimit(redis, project.id);
      if (!rateLimit.allowed) {
        return reply
          .code(429)
          .header('Retry-After', rateLimit.retryAfterSeconds)
          .send({ error: 'rate limit exceeded, try again later' });
      }

      const limit = parseLimit(request.query.limit, DEFAULT_EVENTS_PAGE_SIZE, 500);
      if (limit === null) {
        return reply.code(422).send({ error: 'limit must be a non-negative integer' });
      }
      const cursor = parseCursor(request.query);

      const requestRows = await listNetworkRequestEvents(pool, {
        sessionId: request.params.sessionId,
        projectId: project.id,
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
