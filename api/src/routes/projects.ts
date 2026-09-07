import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { createProject, rotateProjectKeys } from '../db/repository.js';
import { authenticateRequest } from '../auth/apiKey.js';
import { checkRateLimit } from '../redis/rateLimit.js';
import { redisKeys } from '../redis/keys.js';
import type { RedisLike } from '../redis/hotPath.js';
import { getEnv, type AppEnv } from '../config/env.js';

const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 320;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROTATE_RATE_LIMIT_MAX = 5;
const ROTATE_RATE_LIMIT_WINDOW_SECONDS = 3600;

interface CreateProjectBody {
  name?: string;
  email?: string;
}

export interface ProjectRouteDeps {
  pool: Pool;
  redis: RedisLike;
  env?: AppEnv;
}

export function registerProjectRoutes(app: FastifyInstance, deps: ProjectRouteDeps): void {
  const { pool, redis } = deps;
  const env = deps.env ?? getEnv();

  app.post<{ Body: CreateProjectBody }>('/api/projects', async (request, reply) => {
    const rateLimit = await checkRateLimit(
      redis,
      redisKeys.rateLimitSignup(request.ip),
      env.signupRateLimitMax,
      env.signupRateLimitWindowSeconds,
    );
    if (rateLimit.degraded) {
      request.log.warn({ ip: request.ip }, 'rate limiter degraded, allowing signup');
    }
    if (!rateLimit.allowed) {
      return reply
        .code(429)
        .header('Retry-After', rateLimit.retryAfterSeconds)
        .send({ error: 'too many projects created from this address, try again later' });
    }

    const name = request.body?.name?.trim();
    const email = request.body?.email?.trim();

    if (!name || name.length > MAX_NAME_LENGTH) {
      return reply.code(422).send({ error: 'name is required and must be under 200 characters' });
    }
    if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
      return reply.code(422).send({ error: 'a valid email is required' });
    }

    const project = await createProject(pool, name, email);
    return reply.code(201).send({
      id: project.id,
      ingestKey: project.ingestKey,
      dashboardKey: project.dashboardKey,
    });
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/rotate', async (request, reply) => {
    const project = await authenticateRequest(pool, request, 'dashboard');
    if (!project) return reply.code(401).send({ error: 'invalid or missing API key' });
    if (project.id !== request.params.id) {
      return reply.code(403).send({ error: 'that API key does not belong to this project' });
    }

    const rateLimit = await checkRateLimit(
      redis,
      redisKeys.rateLimitRotate(project.id),
      ROTATE_RATE_LIMIT_MAX,
      ROTATE_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!rateLimit.allowed) {
      return reply
        .code(429)
        .header('Retry-After', rateLimit.retryAfterSeconds)
        .send({ error: 'too many key rotations, try again later' });
    }

    const keys = await rotateProjectKeys(pool, project.id);
    request.log.info({ projectId: project.id }, 'project keys rotated');
    return reply.code(200).send({
      id: keys.id,
      ingestKey: keys.ingestKey,
      dashboardKey: keys.dashboardKey,
    });
  });
}
