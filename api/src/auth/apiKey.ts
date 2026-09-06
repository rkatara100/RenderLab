import type { FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { findProjectByApiKey, type ApiKeyScope, type Project } from '../db/repository.js';

export async function authenticateRequest(
  pool: Pool,
  request: FastifyRequest,
  scope: ApiKeyScope,
): Promise<Project | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const apiKey = header.slice('Bearer '.length).trim();
  if (!apiKey) return null;

  const project = await findProjectByApiKey(pool, apiKey, scope);
  return project?.isActive ? project : null;
}
