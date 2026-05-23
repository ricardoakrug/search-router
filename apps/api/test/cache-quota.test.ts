import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// High RPM so the limiter never interferes; no internal token so authStub returns 'self'.
process.env.RATE_LIMIT_RPM = '1000';
process.env.INTERNAL_API_TOKEN = '';

// biome-ignore lint/suspicious/noExplicitAny: Hono app type is not needed in tests
let api: any;
let resetRateLimit: () => void;
let setResponseCache: (c: unknown) => void;
let setQuotaCheck: (f: unknown) => void;
let cacheTtlForIntent: (i: string) => number;
let responseCacheKey: (i: string, q: string, t: string) => string;

beforeAll(async () => {
  api = (await import('../src/routes.js')).api;
  resetRateLimit = (await import('../src/ratelimit.js'))._resetRateLimit;
  ({ setResponseCache, cacheTtlForIntent, responseCacheKey } = await import(
    '../src/response-cache.js'
  ));
  ({ setQuotaCheck } = await import('../src/quota.js'));
});

beforeEach(() => {
  resetRateLimit();
  // Reset seams to OSS defaults between cases.
  setQuotaCheck(() => ({ ok: true }));
  setResponseCache({ get: async () => undefined, set: async () => {} });
});

function post(path: string, body: unknown) {
  return api.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('quota seam', () => {
  it('returns 429 when the quota check denies, before running the search', async () => {
    setQuotaCheck(() => ({ ok: false, reason: 'monthly request quota exceeded' }));
    const res = await post('/v1/search', { query: 'hello world' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'monthly request quota exceeded' });
  });
});

describe('response cache seam', () => {
  it('returns a cache hit without invoking the search pipeline', async () => {
    const sentinel = { cached: true, results: [{ url: 'https://x' }] };
    setResponseCache({ get: async () => sentinel, set: async () => {} });
    const res = await post('/v1/search', { query: 'hello world' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(sentinel);
  });
});

describe('cache TTL policy', () => {
  it('caches read-shaped intents and never caches scrape/crawl', () => {
    expect(cacheTtlForIntent('search')).toBe(300);
    expect(cacheTtlForIntent('research')).toBe(1800);
    expect(cacheTtlForIntent('scrape')).toBe(0);
    expect(cacheTtlForIntent('crawl')).toBe(0);
  });

  it('builds a stable, tenant-scoped key', () => {
    expect(responseCacheKey('search', '  Hello   World ', 't1')).toBe('search|hello world|t1');
  });
});
