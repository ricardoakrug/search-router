import type { Context } from 'hono';

/** The authenticated principal. Same shape the stub has always returned. */
export interface AuthResult {
  tenantId: string;
}

/**
 * Authenticator seam. Async so a managed implementation can do a DB lookup
 * (the managed layer injects a Postgres-backed API-key authenticator via
 * `setAuthenticator`). The OSS default is `authStub`. Returns null when the
 * request is unauthorized. Mirrors the `Router`/`setRouter` seam in core.
 */
export type Authenticator = (c: Context) => Promise<AuthResult | null> | AuthResult | null;

/**
 * OSS default: validate the shared internal token (if configured) and return a
 * fixed tenant. The managed layer swaps this for real API-key/JWT auth.
 */
export function authStub(c: Context): AuthResult | null {
  const required = process.env.INTERNAL_API_TOKEN;
  if (required) {
    const header = c.req.header('authorization');
    const token = header?.replace(/^Bearer\s+/i, '');
    if (token !== required) return null;
  }
  return { tenantId: 'self' };
}

let authenticator: Authenticator = authStub;

/** Swap the authenticator (managed API-key/JWT auth) without touching call sites. */
export function setAuthenticator(next: Authenticator): void {
  authenticator = next;
}

/** Call site uses this; awaits so the sync stub and async managed auth both satisfy it. */
export async function authenticate(c: Context): Promise<AuthResult | null> {
  return authenticator(c);
}
