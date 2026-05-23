import { type Intent, type SearchRequest, runSearch } from '@search-router/core';
import { Hono } from 'hono';
import { authStub } from './auth.js';

/** Path segment → intent. The MCP tool names mirror these. */
const ROUTES: Record<string, Intent> = {
  search: 'search',
  answer: 'answer',
  research: 'research',
  scrape: 'scrape',
  crawl: 'crawl',
  social: 'social',
  serp: 'serp',
  docs: 'docs',
};

interface Body {
  query?: string;
  url?: string;
  recency?: SearchRequest['recency'];
  dateStart?: string;
  dateEnd?: string;
  domains?: string[];
  maxResults?: number;
  thorough?: boolean;
  library?: string;
}

export const api = new Hono();

api.get('/health', (c) => c.json({ ok: true }));

for (const [segment, intent] of Object.entries(ROUTES)) {
  api.post(`/v1/${segment}`, async (c) => {
    const auth = authStub(c);
    if (!auth) return c.json({ error: 'unauthorized' }, 401);

    const body = (await c.req.json().catch(() => ({}))) as Body;
    const query = body.query ?? body.url ?? '';
    if (!query && !body.url) return c.json({ error: 'query or url is required' }, 400);
    if ((intent === 'scrape' || intent === 'crawl') && !body.url) {
      return c.json({ error: `${intent} requires a url` }, 400);
    }

    const req: SearchRequest = {
      intent,
      query,
      tenantId: auth.tenantId,
      url: body.url,
      recency: body.recency,
      dateStart: body.dateStart,
      dateEnd: body.dateEnd,
      domains: body.domains,
      maxResults: body.maxResults,
      thorough: body.thorough,
      library: body.library,
    };

    try {
      const res = await runSearch(req);
      return c.json(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'search failed';
      return c.json({ error: message }, 502);
    }
  });
}
