import type {
  Intent,
  ProviderAdapter,
  ProviderCreds,
  SearchRequest,
  SearchResponse,
} from '../types.js';
import { fetchJson, requireKey } from './http.js';

interface SerpOrganic {
  title: string;
  link: string;
  snippet?: string;
  date?: string;
}
interface SerpBody {
  organic_results?: SerpOrganic[];
}

/** SerpAPI — structured SERP features across engines. Best for serp/SEO extraction. */
export const serpapiAdapter: ProviderAdapter = {
  id: 'serpapi',

  supports(intent: Intent) {
    return intent === 'serp' || intent === 'search';
  },

  async run(req: SearchRequest, creds: ProviderCreds): Promise<SearchResponse> {
    const key = requireKey('serpapi', creds.serpapi);
    const started = Date.now();
    const params = new URLSearchParams({ engine: 'google', q: req.query, api_key: key });
    if (req.maxResults) params.set('num', String(req.maxResults));
    const body = await fetchJson<SerpBody>(
      'serpapi',
      `https://serpapi.com/search?${params.toString()}`,
    );
    return {
      items: (body.organic_results ?? []).map((r) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
        publishedDate: r.date,
        source: 'serpapi',
      })),
      routing: {
        provider: 'serpapi',
        reason: '',
        fallbackUsed: false,
        latencyMs: Date.now() - started,
      },
    };
  },

  estimateCost() {
    return 0.015; // ~$15/1k
  },
};
