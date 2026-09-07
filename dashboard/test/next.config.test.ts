import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('next.config headers', () => {
  it('sets baseline security headers on every route', async () => {
    const headerGroups = await nextConfig.headers?.();
    expect(headerGroups).toBeDefined();
    const group = headerGroups?.[0];
    expect(group?.source).toBe('/:path*');

    const names = group?.headers.map((h) => h.key) ?? [];
    expect(names).toContain('X-Content-Type-Options');
    expect(names).toContain('X-Frame-Options');
    expect(names).toContain('Referrer-Policy');
  });
});
