import { type Intent, type SearchRequest, resolveCreds, runSearch } from '@search-router/core';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authenticate } from './auth.js';
import { log, requestLogger } from './log.js';
import { rateLimit } from './ratelimit.js';
import { SCHEMAS } from './schemas.js';
import { UrlNotAllowedError, assertPublicUrl } from './ssrf.js';

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

const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES ?? 64 * 1024);

export const api = new Hono();

api.use('*', requestLogger);
api.get('/health', (c) => c.json({ ok: true }));

/** Readiness: ready once at least one provider key is resolvable. */
api.get('/ready', async (c) => {
  const creds = await resolveCreds('self');
  const ready = Object.keys(creds).length > 0;
  return c.json({ ready }, ready ? 200 : 503);
});

api.use(
  '/v1/*',
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: 'request body too large' }, 413),
  }),
);
api.use('/v1/*', rateLimit);

for (const [segment, intent] of Object.entries(ROUTES)) {
  api.post(`/v1/${segment}`, async (c) => {
    const auth = await authenticate(c);
    if (!auth) return c.json({ error: 'unauthorized' }, 401);

    const json = await c.req.json().catch(() => ({}));
    const parsed = SCHEMAS[intent].safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid request', issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data as Body;

    if ((intent === 'scrape' || intent === 'crawl') && body.url) {
      try {
        await assertPublicUrl(body.url);
      } catch (err) {
        if (err instanceof UrlNotAllowedError) return c.json({ error: err.message }, 400);
        throw err;
      }
    }

    const req: SearchRequest = {
      intent,
      query: body.query ?? body.url ?? '',
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
      log.error({ requestId: c.get('requestId'), intent, err: message }, 'search failed');
      return c.json({ error: message }, 502);
    }
  });
}
