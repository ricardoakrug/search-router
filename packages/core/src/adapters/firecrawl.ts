import { ProviderError } from '../types.js';
import type {
  Intent,
  ProviderAdapter,
  ProviderCreds,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
} from '../types.js';
import { fetchJson, requireKey } from './http.js';

interface ScrapeBody {
  data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } };
}
interface CrawlStartBody {
  id: string;
}
interface CrawlStatusBody {
  status: 'scraping' | 'completed' | 'failed';
  data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } }[];
}

const BASE = 'https://api.firecrawl.dev/v2';
const CRAWL_MAX_POLLS = 20;
const CRAWL_POLL_MS = 3000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Firecrawl — JS-rendered scrape + full-site crawl. The most content-complete provider. */
export const firecrawlAdapter: ProviderAdapter = {
  id: 'firecrawl',

  supports(intent: Intent) {
    return intent === 'scrape' || intent === 'crawl';
  },

  async run(req: SearchRequest, creds: ProviderCreds): Promise<SearchResponse> {
    const key = requireKey('firecrawl', creds.firecrawl);
    if (!req.url) throw new ProviderError('firecrawl', `${req.intent} requires url`);
    const started = Date.now();
    const auth = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };

    if (req.intent === 'scrape') {
      const body = await fetchJson<ScrapeBody>('firecrawl', `${BASE}/scrape`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ url: req.url, formats: ['markdown'] }),
      });
      const d = body.data;
      const items: SearchResultItem[] = d
        ? [
            {
              title: d.metadata?.title ?? req.url,
              url: d.metadata?.sourceURL ?? req.url,
              content: d.markdown,
              source: 'firecrawl',
            },
          ]
        : [];
      return {
        items,
        routing: {
          provider: 'firecrawl',
          reason: '',
          fallbackUsed: false,
          latencyMs: Date.now() - started,
        },
      };
    }

    // crawl: async job — start then poll until complete (bounded).
    const start = await fetchJson<CrawlStartBody>('firecrawl', `${BASE}/crawl`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ url: req.url, limit: req.maxResults ?? 25 }),
    });
    for (let i = 0; i < CRAWL_MAX_POLLS; i++) {
      const status = await fetchJson<CrawlStatusBody>('firecrawl', `${BASE}/crawl/${start.id}`, {
        headers: { authorization: `Bearer ${key}` },
      });
      if (status.status === 'failed') throw new ProviderError('firecrawl', 'crawl failed');
      if (status.status === 'completed') {
        return {
          items: (status.data ?? []).map((d) => ({
            title: d.metadata?.title ?? d.metadata?.sourceURL ?? req.url ?? '',
            url: d.metadata?.sourceURL ?? req.url ?? '',
            content: d.markdown,
            source: 'firecrawl',
          })),
          routing: {
            provider: 'firecrawl',
            reason: '',
            fallbackUsed: false,
            latencyMs: Date.now() - started,
          },
        };
      }
      await sleep(CRAWL_POLL_MS);
    }
    throw new ProviderError('firecrawl', 'crawl timed out');
  },

  estimateCost(req: SearchRequest) {
    return req.intent === 'crawl' ? 0.001 * (req.maxResults ?? 25) : 0.001;
  },
};
