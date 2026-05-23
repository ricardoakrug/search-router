import type { Context } from 'hono';

/**
 * Auth seam. Now: validate the shared internal token (if configured) and return a
 * fixed tenant. Later: parse an API key / JWT → real tenantId, the same return shape.
 * Returns null when the request is unauthorized.
 */
export function authStub(c: Context): { tenantId: string } | null {
  const required = process.env.INTERNAL_API_TOKEN;
  if (required) {
    const header = c.req.header('authorization');
    const token = header?.replace(/^Bearer\s+/i, '');
    if (token !== required) return null;
  }
  return { tenantId: 'self' };
}
