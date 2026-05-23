import type {
  Intent,
  ProviderAdapter,
  ProviderCreds,
  Recency,
  SearchRequest,
  SearchResponse,
} from '../types.js';
import { fetchJson, requireKey } from './http.js';

interface BraveWebResult {
  title: string;
  url: string;
  description?: string;
  age?: string;
}
interface BraveBody {
  web?: { results?: BraveWebResult[] };
}

const FRESHNESS: Record<Recency, string> = { day: 'pd', week: 'pw', month: 'pm', year: 'py' };

/** Brave — fast independent index. Best for real-time news & keyword search. */
export const braveAdapter: ProviderAdapter = {
  id: 'brave',

  supports(intent: Intent) {
    return intent === 'search' || intent === 'answer';
  },

  async run(req: SearchRequest, creds: ProviderCreds): Promise<SearchResponse> {
    const key = requireKey('brave', creds.brave);
    const started = Date.now();
    const params = new URLSearchParams({
      q: req.query,
      count: String(req.maxResults ?? 10),
    });
    if (req.recency) params.set('freshness', FRESHNESS[req.recency]);
    const body = await fetchJson<BraveBody>(
      'brave',
      `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
      {
        headers: {
          accept: 'application/json',
          'x-subscription-token': key,
        },
      },
    );
    const results = body.web?.results ?? [];
    return {
      items: results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
        publishedDate: r.age,
        source: 'brave',
      })),
      routing: {
        provider: 'brave',
        reason: '',
        fallbackUsed: false,
        latencyMs: Date.now() - started,
      },
    };
  },

  estimateCost() {
    return 5 / 1000; // flat $5/1k
  },
};
