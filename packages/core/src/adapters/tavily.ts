import type {
  Intent,
  ProviderAdapter,
  ProviderCreds,
  SearchRequest,
  SearchResponse,
} from '../types.js';
import { fetchJson, requireKey } from './http.js';

interface TavilyResult {
  title: string;
  url: string;
  content?: string;
  raw_content?: string;
  score?: number;
  published_date?: string;
}
interface TavilySearchBody {
  results: TavilyResult[];
  answer?: string;
}
interface TavilyExtractBody {
  results: { url: string; raw_content?: string }[];
}

/** Tavily — LLM-agent search + extract/crawl. Good default for research & RAG. */
export const tavilyAdapter: ProviderAdapter = {
  id: 'tavily',

  supports(intent: Intent) {
    return (
      intent === 'search' ||
      intent === 'research' ||
      intent === 'scrape' ||
      intent === 'crawl' ||
      intent === 'answer'
    );
  },

  async run(req: SearchRequest, creds: ProviderCreds): Promise<SearchResponse> {
    const key = requireKey('tavily', creds.tavily);
    const started = Date.now();
    const auth = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };

    if (req.intent === 'scrape') {
      if (!req.url) throw new Error('scrape requires url');
      const body = await fetchJson<TavilyExtractBody>('tavily', 'https://api.tavily.com/extract', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ urls: [req.url] }),
      });
      const first = body.results[0];
      return {
        items: first
          ? [{ title: first.url, url: first.url, content: first.raw_content, source: 'tavily' }]
          : [],
        routing: {
          provider: 'tavily',
          reason: '',
          fallbackUsed: false,
          latencyMs: Date.now() - started,
        },
      };
    }

    const body = await fetchJson<TavilySearchBody>('tavily', 'https://api.tavily.com/search', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        query: req.query,
        max_results: req.maxResults ?? 8,
        search_depth: req.intent === 'research' ? 'advanced' : 'basic',
        include_answer: req.intent === 'answer' || req.intent === 'research',
        include_raw_content: req.intent === 'research',
        time_range: req.recency,
        start_date: req.dateStart,
        end_date: req.dateEnd,
        include_domains: req.domains,
      }),
    });
    return {
      items: body.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        content: r.raw_content,
        publishedDate: r.published_date,
        score: r.score,
        source: 'tavily',
      })),
      answer: body.answer,
      routing: {
        provider: 'tavily',
        reason: '',
        fallbackUsed: false,
        latencyMs: Date.now() - started,
      },
    };
  },

  estimateCost(req: SearchRequest) {
    return req.intent === 'research' ? 0.016 : 0.008; // 2 vs 1 credit @ ~$0.008
  },
};
