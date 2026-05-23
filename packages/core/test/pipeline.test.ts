import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSearch } from '../src/pipeline.js';
import { type UsageEvent, setUsageSink } from '../src/usage.js';

const SECRET = 'sk-super-secret-key-value';

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => '' } as Response;
}
function fail(status = 500) {
  return { ok: false, status, json: async () => ({}), text: async () => 'error' } as Response;
}

beforeEach(() => {
  for (const k of ['EXA_API_KEY', 'TAVILY_API_KEY', 'BRAVE_API_KEY']) process.env[k] = SECRET;
  delete process.env.ANTHROPIC_API_KEY; // rules-only
  delete process.env.COST_MAX_USD;
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUsageSink((e) => console.log(JSON.stringify(e)));
});

describe('pipeline fallback + seams', () => {
  it('falls back when the primary provider errors (acceptance #6)', async () => {
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = String(input);
      if (url.includes('api.exa.ai')) return fail(); // primary down
      if (url.includes('api.tavily.com'))
        return okJson({ results: [{ title: 'T', url: 'https://t/1' }] });
      return fail();
    });
    // date-bounded search → exa primary, tavily fallback
    const res = await runSearch({
      intent: 'search',
      query: 'foo',
      tenantId: 'self',
      dateStart: '2023-01-01',
    });
    expect(res.routing.provider).toBe('tavily');
    expect(res.routing.fallbackUsed).toBe(true);
  });

  it('falls back when the primary key is absent (acceptance #6)', async () => {
    delete process.env.EXA_API_KEY; // no key → skip exa
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = String(input);
      if (url.includes('api.tavily.com'))
        return okJson({ results: [{ title: 'T', url: 'https://t/1' }] });
      return fail();
    });
    const res = await runSearch({
      intent: 'search',
      query: 'foo',
      tenantId: 'self',
      dateStart: '2023-01-01',
    });
    expect(res.routing.provider).toBe('tavily');
  });

  it('threads a non-self tenantId through resolveCreds + usageLog unchanged (acceptance #5)', async () => {
    const events: UsageEvent[] = [];
    setUsageSink((e) => events.push(e));
    vi.stubGlobal('fetch', async () =>
      okJson({ web: { results: [{ title: 'B', url: 'https://b/1' }] } }),
    );
    const res = await runSearch({
      intent: 'answer',
      query: 'capital of france',
      tenantId: 'tenant-xyz',
    });
    expect(res.routing.provider).toBe('brave');
    expect(events.at(-1)?.tenantId).toBe('tenant-xyz');
  });

  it('never leaks the API key into the response (acceptance #7)', async () => {
    vi.stubGlobal('fetch', async () =>
      okJson({ web: { results: [{ title: 'B', url: 'https://b/1' }] } }),
    );
    const res = await runSearch({ intent: 'answer', query: 'hi', tenantId: 'self' });
    expect(JSON.stringify(res)).not.toContain(SECRET);
  });
});
