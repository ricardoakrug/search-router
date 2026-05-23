import type {
  Intent,
  ProviderAdapter,
  ProviderCreds,
  SearchRequest,
  SearchResponse,
} from '../types.js';
import { fetchJson, requireKey } from './http.js';

interface PplxResult {
  title?: string;
  url: string;
  date?: string;
  snippet?: string;
}
interface PplxBody {
  choices: { message: { content: string } }[];
  citations?: string[];
  search_results?: PplxResult[];
}

/** Perplexity Sonar — cited answer synthesis. Async-grade latency; best for answer/research. */
export const perplexityAdapter: ProviderAdapter = {
  id: 'perplexity',

  supports(intent: Intent) {
    return intent === 'answer' || intent === 'research';
  },

  async run(req: SearchRequest, creds: ProviderCreds): Promise<SearchResponse> {
    const key = requireKey('perplexity', creds.perplexity);
    const started = Date.now();
    const model = req.intent === 'research' ? 'sonar-pro' : 'sonar';
    const body = await fetchJson<PplxBody>(
      'perplexity',
      'https://api.perplexity.ai/chat/completions',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: req.query }],
          ...(req.recency ? { search_recency_filter: req.recency } : {}),
        }),
      },
    );
    return {
      answer: body.choices[0]?.message.content,
      citations: body.citations,
      items: (body.search_results ?? []).map((r) => ({
        title: r.title ?? r.url,
        url: r.url,
        snippet: r.snippet,
        publishedDate: r.date,
        source: 'perplexity',
      })),
      routing: {
        provider: 'perplexity',
        reason: '',
        fallbackUsed: false,
        latencyMs: Date.now() - started,
      },
    };
  },

  estimateCost(req: SearchRequest) {
    return req.intent === 'research' ? 0.014 : 0.005; // request fee, rough
  },
};
