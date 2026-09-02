import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type {
  ComponentSummary,
  EventPageCursor,
  RenderEventDetail,
  RenderTimelineEvent,
  SessionSummary,
} from '@renderlab/shared-types';
import { authenticateRequest } from '../auth/apiKey.js';
import {
  getRenderEventDetail,
  listRenderEvents,
  listSessionComponents,
  listSessions,
} from '../db/repository.js';
import { codeToRenderReason } from './renderReasonCodes.js';

function parseJsonColumn<T>(value: string | null): T | null {
  return value ? (JSON.parse(value) as T) : null;
}

/** A session is "live" if it hasn't been explicitly ended and was seen
 * recently — matches the Redis presence TTL window (ARCHITECTURE.md §3.3),
 * so the dashboard's badge and the SDK's own liveness signal agree. */
const LIVE_WINDOW_MS = 60_000;

function isLive(endedAt: string | null, lastSeenAt: string): boolean {
  return endedAt === null && Date.now() - new Date(lastSeenAt).getTime() < LIVE_WINDOW_MS;
}

const DEFAULT_EVENTS_PAGE_SIZE = 200;

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

export interface ReadRouteDeps {
  pool: Pool;
}

/**
 * Read endpoints for the dashboard. Reuses the same project API-key Bearer
 * auth as ingestion (ARCHITECTURE.md §3.5: no separate human login system
 * yet — one project, one key, scoping every read the same way it scopes
 * writes). A real multi-user login is out of scope for this phase.
 */
export function registerReadRoutes(app: FastifyInstance, deps: ReadRouteDeps): void {
  const { pool } = deps;

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

  // Phase 4: paginated raw events backing the virtualized render timeline
  // (ARCHITECTURE.md §3.2/§4). Keyset cursor, never OFFSET — see
  // repository.ts's listRenderEvents. `avoidableOnly` (Phase 5) drives the
  // why-did-it-render list via the same partial index the schema already
  // has for exactly this query.
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

  // Phase 5: single-event drill-down for the why-did-it-render panel.
  // Requires `ts` as a query param — see getRenderEventDetail's doc comment
  // for why (keeps the lookup indexed under partitioning).
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
}
