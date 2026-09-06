import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { createProject } from '../db/repository.js';

const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 320;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CreateProjectBody {
  name?: string;
  email?: string;
}

export interface ProjectRouteDeps {
  pool: Pool;
}

export function registerProjectRoutes(app: FastifyInstance, deps: ProjectRouteDeps): void {
  const { pool } = deps;

  app.post<{ Body: CreateProjectBody }>('/api/projects', async (request, reply) => {
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
