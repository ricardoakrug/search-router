import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Configure the edge knobs before importing the app (routes.ts reads MAX_BODY_BYTES at load).
process.env.MAX_BODY_BYTES = '50';
process.env.RATE_LIMIT_RPM = '3';
process.env.INTERNAL_API_TOKEN = '';

// biome-ignore lint/suspicious/noExplicitAny: Hono app type is not needed in tests
let api: any;
let resetRateLimit: () => void;

beforeAll(async () => {
  api = (await import('../src/routes.js')).api;
  resetRateLimit = (await import('../src/ratelimit.js'))._resetRateLimit;
});

beforeEach(() => resetRateLimit());

function post(path: string, body: unknown) {
  return api.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('api edge behavior', () => {
  it('rejects an invalid body with 400', async () => {
    const res = await post('/v1/search', {}); // missing required query
    expect(res.status).toBe(400);
  });

  it('rejects an oversize body with 413', async () => {
    const res = await post('/v1/search', { query: 'x'.repeat(200) });
    expect(res.status).toBe(413);
  });

  it('rate-limits past the per-window cap with 429 + Retry-After', async () => {
    for (let i = 0; i < 3; i++) {
      const ok = await post('/v1/search', {}); // counted even though body is invalid
      expect(ok.status).toBe(400);
    }
    const limited = await post('/v1/search', {});
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  it('/ready is 503 when no provider keys are set', async () => {
    const saved: Record<string, string | undefined> = {};
    // Clear every known provider env var.
    const keys = [
      'EXA_API_KEY',
      'PERPLEXITY_API_KEY',
      'BRAVE_API_KEY',
      'TAVILY_API_KEY',
      'FIRECRAWL_API_KEY',
      'SERPAPI_API_KEY',
      'XAI_API_KEY',
      'CONTEXT7_API_KEY',
    ];
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    const res = await api.request('/ready');
    expect(res.status).toBe(503);
    for (const k of keys) if (saved[k] !== undefined) process.env[k] = saved[k];
  });

  it('/ready is 200 when at least one provider key is set', async () => {
    process.env.EXA_API_KEY = 'test-key';
    const res = await api.request('/ready');
    expect(res.status).toBe(200);
    delete process.env.EXA_API_KEY;
  });

  it('/health is always 200', async () => {
    const res = await api.request('/health');
    expect(res.status).toBe(200);
  });
});
