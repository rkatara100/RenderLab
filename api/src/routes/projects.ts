import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { createProject } from '../db/repository.js';
import { checkRateLimit } from '../redis/rateLimit.js';
import { redisKeys } from '../redis/keys.js';
import type { RedisLike } from '../redis/hotPath.js';

const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 320;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SIGNUP_RATE_LIMIT = Number(process.env.SIGNUP_RATE_LIMIT_MAX ?? 10);
const SIGNUP_RATE_LIMIT_WINDOW_SECONDS = Number(
  process.env.SIGNUP_RATE_LIMIT_WINDOW_SECONDS ?? 900,
);

interface CreateProjectBody {
  name?: string;
  email?: string;
}

export interface ProjectRouteDeps {
  pool: Pool;
  redis: RedisLike;
}

export function registerProjectRoutes(app: FastifyInstance, deps: ProjectRouteDeps): void {
  const { pool, redis } = deps;

  app.post<{ Body: CreateProjectBody }>('/api/projects', async (request, reply) => {
    const rateLimit = await checkRateLimit(
      redis,
      redisKeys.rateLimitSignup(request.ip),
      SIGNUP_RATE_LIMIT,
      SIGNUP_RATE_LIMIT_WINDOW_SECONDS,
    );
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
    return reply.code(201).send({ id: project.id, apiKey: project.apiKey });
  });
}
