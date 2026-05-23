import { afterEach, beforeAll, describe, expect, it } from 'vitest';

// Disable the rate limiter and clear the shared token before importing the app.
process.env.RATE_LIMIT_RPM = '0';
process.env.INTERNAL_API_TOKEN = '';

// biome-ignore lint/suspicious/noExplicitAny: Hono app type is not needed in tests
let api: any;
let setAuthenticator: (next: unknown) => void;
// biome-ignore lint/suspicious/noExplicitAny: stub signature mirrors Authenticator
let authStub: any;

beforeAll(async () => {
  api = (await import('../src/routes.js')).api;
  const auth = await import('../src/auth.js');
  setAuthenticator = auth.setAuthenticator as typeof setAuthenticator;
  authStub = auth.authStub;
});

// Restore the OSS default after each case so other suites stay green.
afterEach(() => {
  setAuthenticator(authStub);
  process.env.INTERNAL_API_TOKEN = '';
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return api.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('auth seam', () => {
  it('default stub authorizes when no INTERNAL_API_TOKEN is set', async () => {
    // Invalid body → 400 proves auth passed (not 401).
    const res = await post('/v1/search', {});
    expect(res.status).toBe(400);
  });

  it('default stub returns 401 on wrong token when INTERNAL_API_TOKEN is set', async () => {
    process.env.INTERNAL_API_TOKEN = 'secret';
    const res = await post('/v1/search', {}, { authorization: 'Bearer wrong' });
    expect(res.status).toBe(401);
  });

  it('injected authenticator resolving a tenant authorizes the request', async () => {
    setAuthenticator(async () => ({ tenantId: 'tenant-123' }));
    const res = await post('/v1/search', {}); // invalid body → 400, i.e. past auth
    expect(res.status).toBe(400);
  });

  it('injected authenticator returning null yields 401', async () => {
    setAuthenticator(async () => null);
    const res = await post('/v1/search', { query: 'anything' });
    expect(res.status).toBe(401);
  });
});
